.DEFAULT_GOAL := help
SHELL := /bin/bash
.SHELLFLAGS := -ec

# Cada recipe roda num shell novo, então sourcear o nvm em cada uma garante Node 20
# mesmo quando o shell padrão da máquina aponta para outra versão. `corepack
# enable pnpm` instala o shim pnpm no bin do Node 20 (idempotente) — turbo e
# outras ferramentas precisam de `pnpm` direto no PATH, não via `corepack pnpm`.
NVM := export NVM_DIR="$$HOME/.nvm" && . "$$NVM_DIR/nvm.sh" && nvm use 20 >/dev/null && export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && corepack enable pnpm
PNPM := pnpm

.PHONY: help setup dev test typecheck \
        db-up db-down db-migrate db-seed db-generate db-reset \
        clean

help: ## Lista os targets disponíveis
	@echo "Our Farm — comandos make:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Primeiro setup completo (install + .env + docker + migrate + seed)
	$(NVM) && $(PNPM) install
	@test -f .env || (cp .env.example .env && echo ".env criado a partir de .env.example")
	docker compose up -d
	@echo "Aguardando Postgres ficar pronto..."
	@for i in $$(seq 1 30); do docker compose exec -T postgres pg_isready -U ourfarm -d ourfarm >/dev/null 2>&1 && break; sleep 1; done
	$(NVM) && $(PNPM) db:migrate
	$(NVM) && $(PNPM) db:seed
	@echo ""
	@echo "Setup completo. Rode 'make dev' para subir o jogo."

dev: ## Sobe web (:5173) + server (:2567) juntos
	$(NVM) && $(PNPM) dev

test: ## Roda os testes de todos os pacotes (Vitest)
	$(NVM) && $(PNPM) test

typecheck: ## Checa tipos de todos os pacotes
	$(NVM) && $(PNPM) typecheck

db-up: ## Sobe o Postgres (docker compose)
	docker compose up -d

db-down: ## Para o Postgres (mantém o volume com os dados)
	docker compose down

db-migrate: ## Aplica as migrations no banco
	$(NVM) && $(PNPM) db:migrate

db-seed: ## Semeia a fazenda compartilhada (idempotente)
	$(NVM) && $(PNPM) db:seed

db-generate: ## Gera uma nova migration a partir do schema Drizzle
	$(NVM) && $(PNPM) db:generate

db-reset: ## Apaga o volume do banco e recria do zero (perde dados!)
	docker compose down -v
	docker compose up -d
	@for i in $$(seq 1 30); do docker compose exec -T postgres pg_isready -U ourfarm -d ourfarm >/dev/null 2>&1 && break; sleep 1; done
	$(NVM) && $(PNPM) db:migrate
	$(NVM) && $(PNPM) db:seed

clean: ## Remove node_modules, dist e caches do Turbo
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist
	rm -rf .turbo apps/*/.turbo packages/*/.turbo
