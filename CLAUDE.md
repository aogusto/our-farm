# Our Farm

Jogo de fazenda web multiplayer em tempo real. Jogadores compartilham uma
fazenda e se veem como mãozinhas flutuantes (estilo Figma). Marco 1: presença
ao vivo + loop plantar → crescer → colher.

## Monorepo

- `packages/shared` — tipos do domínio + regras de jogo puras (isomórfico, sem
  I/O). Toda regra de jogo mora aqui.
- `apps/server` — Colyseus (cada fazenda = uma Room) + rotas HTTP de identidade
  + Postgres via Drizzle. Schema e migrations em `apps/server/drizzle`.
- `apps/web` — Vite + Phaser 4 + cliente Colyseus.

## Primeiro setup (clone novo)

Atalho via Makefile:

```bash
nvm use 20      # ou nvm install 20 se ainda não tiver
make setup      # install + .env + docker + migrate + seed
make dev        # web :5173 + server :2567
```

Equivalente em comandos diretos:

```bash
nvm use 20
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`make help` lista todos os targets (`test`, `typecheck`, `db-reset`, etc.).

## Comandos

- `docker compose up -d` — sobe o Postgres local.
- `pnpm dev` — sobe `web` (porta 5173) e `server` (porta 2567) juntos.
- `pnpm test` — roda os testes de todos os pacotes (Vitest).
- `pnpm typecheck` — checa tipos de todos os pacotes.
- `pnpm db:generate` — gera uma migration a partir do schema Drizzle.
- `pnpm db:migrate` — aplica as migrations no banco.
- `pnpm db:seed` — cria a fazenda compartilhada.

Os testes do servidor são de integração: exigem o Postgres no ar e migrado.

## Convenções

- TypeScript em modo `strict`, ESM em todos os pacotes.
- Regra de jogo (crescimento, validação) vive em `packages/shared` como funções
  puras e é testada com TDD. Servidor e cliente importam, não duplicam.
- O servidor é autoritativo: valida → persiste no Postgres → reflete no estado
  da Room. O Postgres é a fonte de verdade.
- O cliente é fino: renderiza o estado da Room e envia intenções
  (`cursor`, `plant`, `harvest`); nunca muta estado diretamente.
- Decorators do Colyseus Schema exigem `experimentalDecorators: true` e
  `useDefineForClassFields: false` no tsconfig (já configurado na base).

## Documentos

- Spec da fundação: `docs/superpowers/specs/2026-05-22-our-farm-foundation-design.md`
- Plano de implementação: `docs/superpowers/plans/2026-05-22-our-farm-foundation.md`
