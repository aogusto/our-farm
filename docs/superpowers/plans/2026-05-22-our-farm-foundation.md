# Our Farm — Plano de Implementação da Fundação (Marco 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a fundação jogável do Our Farm — monorepo + servidor Colyseus + cliente Phaser — onde dois navegadores entram na mesma fazenda compartilhada, veem as mãozinhas um do outro ao vivo e completam o loop plantar → crescer → colher, com tudo validado no servidor, persistido em Postgres e sincronizado.

**Architecture:** Monorepo pnpm + Turborepo com três pacotes. `packages/shared` guarda tipos e regras de jogo puras (isomórficas). `apps/server` roda Colyseus (cada fazenda = uma Room) + rotas HTTP de identidade + Postgres via Drizzle. `apps/web` é Vite + Phaser 3 + cliente Colyseus. O servidor é autoritativo: valida → persiste → reflete no estado da Room, que sincroniza automaticamente.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript (ESM), Colyseus 0.16, `@colyseus/schema`, Postgres 16, Drizzle ORM, Express, Phaser 3, Vite, Vitest, `@colyseus/testing`, Docker Compose.

---

## Pré-requisitos

- Node 20 LTS ativo (já instalado: v20.20.2) — confirme com `node --version`.
- pnpm disponível (já instalado: 10.29.3) — confirme com `pnpm --version`.
- Docker disponível (já instalado) — confirme com `docker --version`.
- O repositório git já existe (commits do spec em `docs/`).

## Mapa de arquivos

```
our-farm/
├── package.json                 raiz: workspace + scripts orquestrados
├── pnpm-workspace.yaml           declara apps/* e packages/*
├── turbo.json                    tasks dev/test/typecheck
├── tsconfig.base.json            config TS compartilhada
├── docker-compose.yml            Postgres 16 local
├── .env.example / .env           DATABASE_URL, PORT
├── .nvmrc / .gitignore
├── .claude/settings.json         allowlist de permissões
├── CLAUDE.md                     convenções (escrito por último)
├── packages/shared/
│   └── src/
│       ├── index.ts              barrel export
│       ├── types.ts              User, Farm, Crop, payloads de mensagem
│       ├── crops.ts              catálogo de culturas
│       ├── hand.ts               estilos de mão + normalização
│       ├── crop-stage.ts         getCropStage (puro)
│       ├── crop-stage.test.ts
│       ├── validation.ts         validatePlant / validateHarvest (puro)
│       └── validation.test.ts
├── apps/server/
│   ├── drizzle.config.ts
│   ├── vitest.config.ts
│   ├── drizzle/                  migrations geradas (versionadas)
│   └── src/
│       ├── env.ts                carrega .env da raiz
│       ├── index.ts              entrypoint (listen)
│       ├── app.config.ts         define rooms + rotas express
│       ├── db/
│       │   ├── schema.ts         tabelas Drizzle
│       │   ├── client.ts         conexão Postgres
│       │   ├── repository.ts     acesso a dados ↔ tipos do domínio
│       │   ├── migrate.ts        roda migrations
│       │   └── seed.ts           cria a fazenda compartilhada
│       ├── http/routes.ts        POST /api/register, GET /api/me
│       ├── rooms/
│       │   ├── schema.ts         FarmState, Cursor, CropState
│       │   ├── FarmRoom.ts       a Room
│       │   └── FarmRoom.test.ts
│       └── test/db-helpers.ts    helpers de teste (reset/seed)
└── apps/web/
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.ts               orquestra identidade → conexão → jogo
        ├── config.ts             URLs do servidor
        ├── api.ts                cliente HTTP de identidade
        ├── identity.ts           token no localStorage
        ├── net/room.ts           conexão Colyseus
        ├── game/
        │   ├── constants.ts      TILE, etc.
        │   └── FarmScene.ts      cena Phaser
        └── ui/
            ├── styles.css
            ├── registerOverlay.ts  formulário de apelido + mão
            └── hud.ts              seletor de cultura
```

---

## Task 1: Esqueleto do monorepo

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Criar os arquivos de configuração da raiz**

`.nvmrc`:
```
20
```

`.gitignore`:
```
node_modules/
dist/
.turbo/
.env
*.log
.worktrees/
```

`package.json`:
```json
{
  "name": "our-farm",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.29.3",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "turbo run dev",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:generate": "pnpm --filter @our-farm/server db:generate",
    "db:migrate": "pnpm --filter @our-farm/server db:migrate",
    "db:seed": "pnpm --filter @our-farm/server db:seed"
  },
  "devDependencies": {}
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "test": {},
    "typecheck": {}
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "useDefineForClassFields": false,
    "experimentalDecorators": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ourfarm
      POSTGRES_PASSWORD: ourfarm
      POSTGRES_DB: ourfarm
    ports:
      - "5432:5432"
    volumes:
      - ourfarm_pgdata:/var/lib/postgresql/data
volumes:
  ourfarm_pgdata:
```

`.env.example`:
```
DATABASE_URL=postgresql://ourfarm:ourfarm@localhost:5432/ourfarm
PORT=2567
```

- [ ] **Step 2: Criar o `.env` local e instalar o Turborepo**

Run:
```bash
cp .env.example .env
pnpm add -w -D turbo typescript
```
Expected: `pnpm` cria `node_modules/` e atualiza `package.json` com `turbo` e `typescript` em `devDependencies`, sem erros.

- [ ] **Step 3: Verificar que o workspace está válido**

Run: `pnpm -r list --depth -1`
Expected: lista o pacote raiz `our-farm` sem erro (ainda não há sub-pacotes — saída curta, exit 0).

- [ ] **Step 4: Commit**

```bash
git add .nvmrc .gitignore package.json pnpm-workspace.yaml turbo.json tsconfig.base.json docker-compose.yml .env.example pnpm-lock.yaml
git commit -m "chore: scaffold monorepo (pnpm workspaces + turborepo)"
```

---

## Task 2: `packages/shared` — esqueleto, tipos e catálogo de culturas

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/types.ts`, `packages/shared/src/hand.ts`, `packages/shared/src/crops.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Criar `package.json` e `tsconfig.json` do pacote**

`packages/shared/package.json`:
```json
{
  "name": "@our-farm/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {}
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"] },
  "include": ["src"]
}
```

- [ ] **Step 2: Instalar Vitest no pacote**

Run: `pnpm --filter @our-farm/shared add -D vitest`
Expected: `vitest` adicionado em `devDependencies` de `packages/shared/package.json`.

- [ ] **Step 3: Criar `types.ts` (tipos do domínio)**

`packages/shared/src/types.ts`:
```ts
export type HandShape = "point" | "open" | "pinch";

export interface HandStyle {
  color: string; // hex "#RRGGBB"
  shape: HandShape;
}

export interface User {
  id: string;
  nickname: string;
  handStyle: HandStyle;
  token: string;
  createdAt: string; // ISO
}

export type FarmType = "shared" | "personal";

export interface Farm {
  id: string;
  name: string;
  ownerId: string | null;
  type: FarmType;
  gridWidth: number;
  gridHeight: number;
}

export type CropType = "carrot" | "corn";

export interface Crop {
  id: string;
  farmId: string;
  x: number;
  y: number;
  cropType: CropType;
  plantedAt: number; // epoch ms
  plantedBy: string;
}

/** Payloads de mensagem cliente → servidor. */
export interface CursorMessage { x: number; y: number; }
export interface PlantMessage { x: number; y: number; cropType: CropType; }
export interface HarvestMessage { x: number; y: number; }
```

- [ ] **Step 4: Criar `hand.ts` (estilos de mão)**

`packages/shared/src/hand.ts`:
```ts
import type { HandShape, HandStyle } from "./types";

export const HAND_SHAPES: HandShape[] = ["point", "open", "pinch"];

export const DEFAULT_HAND_STYLE: HandStyle = { color: "#ffcc00", shape: "point" };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHandShape(v: unknown): v is HandShape {
  return typeof v === "string" && (HAND_SHAPES as string[]).includes(v);
}

/** Aceita entrada não-confiável e devolve sempre um HandStyle válido. */
export function normalizeHandStyle(input: unknown): HandStyle {
  if (typeof input !== "object" || input === null) return { ...DEFAULT_HAND_STYLE };
  const candidate = input as Record<string, unknown>;
  const color = typeof candidate.color === "string" && HEX_RE.test(candidate.color)
    ? candidate.color
    : DEFAULT_HAND_STYLE.color;
  const shape = isHandShape(candidate.shape) ? candidate.shape : DEFAULT_HAND_STYLE.shape;
  return { color, shape };
}
```

- [ ] **Step 5: Criar `crops.ts` (catálogo de culturas)**

`packages/shared/src/crops.ts`:
```ts
import type { CropType } from "./types";

export interface CropDefinition {
  type: CropType;
  label: string;
  growthMs: number; // tempo total até ficar pronta
  stages: number;   // nº de estágios visuais (inclui o final)
}

export const CROP_CATALOG: Record<CropType, CropDefinition> = {
  carrot: { type: "carrot", label: "Cenoura", growthMs: 30_000, stages: 4 },
  corn:   { type: "corn",   label: "Milho",   growthMs: 120_000, stages: 4 },
};

export const CROP_TYPES = Object.keys(CROP_CATALOG) as CropType[];

export function isCropType(value: unknown): value is CropType {
  return typeof value === "string" && value in CROP_CATALOG;
}
```

- [ ] **Step 6: Criar `index.ts` (barrel)**

`packages/shared/src/index.ts`:
```ts
export * from "./types";
export * from "./hand";
export * from "./crops";
export * from "./crop-stage";
export * from "./validation";
```
Nota: `crop-stage` e `validation` são criados nas Tasks 3 e 4. O `typecheck` desta task falharia por causa desses re-exports, então a verificação abaixo roda só depois — por ora, o `index.ts` é escrito completo e o `typecheck` é confirmado ao final da Task 4.

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): domain types, hand styles and crop catalog"
```

---

## Task 3: `packages/shared` — `getCropStage` (TDD)

**Files:**
- Create: `packages/shared/src/crop-stage.ts`
- Test: `packages/shared/src/crop-stage.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/shared/src/crop-stage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getCropStage } from "./crop-stage";
import { CROP_CATALOG } from "./crops";

const PLANTED = 1_000_000;
const CARROT = CROP_CATALOG.carrot;

describe("getCropStage", () => {
  it("retorna estágio 0 e não-colhível no instante do plantio", () => {
    expect(getCropStage("carrot", PLANTED, PLANTED)).toEqual({ stage: 0, harvestable: false });
  });

  it("retorna estágio 0 quando 'now' é anterior ao plantio (clamp)", () => {
    expect(getCropStage("carrot", PLANTED, PLANTED - 5000)).toEqual({ stage: 0, harvestable: false });
  });

  it("avança de estágio conforme o tempo passa", () => {
    const half = PLANTED + CARROT.growthMs / 2;
    const result = getCropStage("carrot", PLANTED, half);
    expect(result.stage).toBe(2); // metade de 4 estágios
    expect(result.harvestable).toBe(false);
  });

  it("fica colhível no estágio final ao completar growthMs", () => {
    const done = PLANTED + CARROT.growthMs;
    expect(getCropStage("carrot", PLANTED, done)).toEqual({ stage: 3, harvestable: true });
  });

  it("permanece no estágio final e colhível bem depois do tempo", () => {
    const late = PLANTED + CARROT.growthMs * 10;
    expect(getCropStage("carrot", PLANTED, late)).toEqual({ stage: 3, harvestable: true });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @our-farm/shared test`
Expected: FAIL — `Failed to resolve import "./crop-stage"` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `getCropStage`**

`packages/shared/src/crop-stage.ts`:
```ts
import { CROP_CATALOG } from "./crops";
import type { CropType } from "./types";

export interface CropStage {
  stage: number;       // 0-indexed (0 .. stages-1)
  harvestable: boolean;
}

/** Estágio visual de uma cultura, derivado puramente do tempo decorrido. */
export function getCropStage(cropType: CropType, plantedAt: number, now: number): CropStage {
  const def = CROP_CATALOG[cropType];
  const elapsed = Math.max(0, now - plantedAt);
  const progress = Math.min(1, elapsed / def.growthMs);
  const stage = Math.min(def.stages - 1, Math.floor(progress * def.stages));
  return { stage, harvestable: progress >= 1 };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @our-farm/shared test`
Expected: PASS — 5 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/crop-stage.ts packages/shared/src/crop-stage.test.ts
git commit -m "feat(shared): getCropStage derives growth stage from elapsed time"
```

---

## Task 4: `packages/shared` — `validatePlant` / `validateHarvest` (TDD)

**Files:**
- Create: `packages/shared/src/validation.ts`
- Test: `packages/shared/src/validation.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/shared/src/validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validatePlant, validateHarvest } from "./validation";
import { CROP_CATALOG } from "./crops";

const GRID = { gridWidth: 16, gridHeight: 16 };

describe("validatePlant", () => {
  it("aceita um plantio válido em terra vazia", () => {
    const r = validatePlant({ x: 3, y: 5, cropType: "carrot", occupied: false, ...GRID });
    expect(r).toEqual({ ok: true, cropType: "carrot" });
  });

  it("rejeita coordenadas fora do grid", () => {
    expect(validatePlant({ x: 16, y: 0, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: -1, y: 0, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
  });

  it("rejeita coordenadas não-inteiras", () => {
    expect(validatePlant({ x: 1.5, y: 0, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
  });

  it("rejeita terra já ocupada", () => {
    expect(validatePlant({ x: 1, y: 1, cropType: "carrot", occupied: true, ...GRID }).ok).toBe(false);
  });

  it("rejeita cultura desconhecida", () => {
    expect(validatePlant({ x: 1, y: 1, cropType: "banana", occupied: false, ...GRID }).ok).toBe(false);
  });
});

describe("validateHarvest", () => {
  const PLANTED = 1_000_000;

  it("aceita colher cultura pronta", () => {
    const now = PLANTED + CROP_CATALOG.carrot.growthMs;
    expect(validateHarvest({ cropType: "carrot", plantedAt: PLANTED, now })).toEqual({ ok: true });
  });

  it("rejeita colher cultura ainda crescendo", () => {
    expect(validateHarvest({ cropType: "carrot", plantedAt: PLANTED, now: PLANTED + 1000 }).ok).toBe(false);
  });

  it("rejeita colher onde não há cultura", () => {
    expect(validateHarvest({ cropType: null, plantedAt: null, now: PLANTED }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @our-farm/shared test`
Expected: FAIL — `Failed to resolve import "./validation"`.

- [ ] **Step 3: Implementar `validation.ts`**

`packages/shared/src/validation.ts`:
```ts
import { isCropType } from "./crops";
import { getCropStage } from "./crop-stage";
import type { CropType } from "./types";

export interface PlantInput {
  x: number;
  y: number;
  cropType: string;
  occupied: boolean;
  gridWidth: number;
  gridHeight: number;
}

export type PlantValidation =
  | { ok: true; cropType: CropType }
  | { ok: false; reason: string };

export function validatePlant(input: PlantInput): PlantValidation {
  if (!Number.isInteger(input.x) || !Number.isInteger(input.y)) {
    return { ok: false, reason: "coordenadas devem ser inteiras" };
  }
  if (input.x < 0 || input.x >= input.gridWidth || input.y < 0 || input.y >= input.gridHeight) {
    return { ok: false, reason: "fora do grid" };
  }
  if (input.occupied) {
    return { ok: false, reason: "terra ocupada" };
  }
  if (!isCropType(input.cropType)) {
    return { ok: false, reason: "cultura desconhecida" };
  }
  return { ok: true, cropType: input.cropType };
}

export interface HarvestInput {
  cropType: CropType | null;
  plantedAt: number | null;
  now: number;
}

export type HarvestValidation =
  | { ok: true }
  | { ok: false; reason: string };

export function validateHarvest(input: HarvestInput): HarvestValidation {
  if (input.cropType === null || input.plantedAt === null) {
    return { ok: false, reason: "não há cultura aqui" };
  }
  if (!getCropStage(input.cropType, input.plantedAt, input.now).harvestable) {
    return { ok: false, reason: "ainda não está pronta" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @our-farm/shared test`
Expected: PASS — todos os testes de `crop-stage` e `validation` verdes.

- [ ] **Step 5: Confirmar o typecheck do pacote inteiro**

Run: `pnpm --filter @our-farm/shared typecheck`
Expected: sem erros (o barrel `index.ts` agora resolve tudo).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/validation.ts packages/shared/src/validation.test.ts
git commit -m "feat(shared): validatePlant and validateHarvest pure rules"
```

---

## Task 5: `apps/server` — esqueleto + schema Drizzle + migração

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/drizzle.config.ts`, `apps/server/src/env.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/db/client.ts`, `apps/server/src/db/migrate.ts`

- [ ] **Step 1: Criar `package.json` e `tsconfig.json` do servidor**

`apps/server/package.json`:
```json
{
  "name": "@our-farm/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src", "drizzle.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 2: Instalar as dependências do servidor**

Run:
```bash
pnpm --filter @our-farm/server add colyseus @colyseus/tools @colyseus/schema express cors drizzle-orm postgres dotenv
pnpm --filter @our-farm/server add -D tsx typescript vitest @colyseus/testing drizzle-kit @types/node @types/express @types/cors
pnpm --filter @our-farm/server add "@our-farm/shared@workspace:*"
```
Expected: `package.json` do servidor populado; `@our-farm/shared` linkado via `workspace:*`.

- [ ] **Step 3: Criar o carregador de ambiente**

`apps/server/src/env.ts`:
```ts
import { config } from "dotenv";
import { resolve } from "node:path";

// O servidor e os testes rodam com cwd = apps/server; o .env vive na raiz.
config({ path: resolve(process.cwd(), "../../.env") });
```

- [ ] **Step 4: Criar o schema Drizzle**

`apps/server/src/db/schema.ts`:
```ts
import { pgTable, uuid, text, integer, timestamp, jsonb, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  nickname: text("nickname").notNull(),
  handStyle: jsonb("hand_style").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const farms = pgTable("farms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id),
  type: text("type").notNull(),
  gridWidth: integer("grid_width").notNull(),
  gridHeight: integer("grid_height").notNull(),
});

export const crops = pgTable("crops", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").notNull().references(() => farms.id),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  cropType: text("crop_type").notNull(),
  plantedAt: timestamp("planted_at", { withTimezone: true }).notNull().defaultNow(),
  plantedBy: uuid("planted_by").notNull().references(() => users.id),
}, (table) => ({
  uniqueTile: unique("crops_farm_tile_unique").on(table.farmId, table.x, table.y),
}));
```

- [ ] **Step 5: Criar o cliente de banco**

`apps/server/src/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não está definida (verifique o .env da raiz)");
}

export const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });
```

- [ ] **Step 6: Criar `drizzle.config.ts` e o runner de migração**

`apps/server/drizzle.config.ts`:
```ts
import "./src/env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`apps/server/src/db/migrate.ts`:
```ts
import "../env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./client";

await migrate(db, { migrationsFolder: "./drizzle" });
await queryClient.end();
console.log("Migrações aplicadas.");
```

- [ ] **Step 7: Subir o Postgres, gerar e aplicar a migração**

Run:
```bash
docker compose up -d
pnpm db:generate
pnpm db:migrate
```
Expected: `docker compose` sobe o container `postgres`; `db:generate` cria `apps/server/drizzle/0000_*.sql`; `db:migrate` imprime `Migrações aplicadas.`.

- [ ] **Step 8: Verificar as tabelas criadas**

Run: `docker compose exec -T postgres psql -U ourfarm -d ourfarm -c "\dt"`
Expected: lista as tabelas `users`, `farms`, `crops` (e `__drizzle_migrations`).

- [ ] **Step 9: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat(server): scaffold + drizzle schema (users, farms, crops)"
```

---

## Task 6: `apps/server` — seed + funções de repositório

**Files:**
- Create: `apps/server/src/db/seed.ts`, `apps/server/src/db/repository.ts`

- [ ] **Step 1: Criar o repositório (acesso a dados ↔ tipos do domínio)**

`apps/server/src/db/repository.ts`:
```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { users, farms, crops } from "./schema";
import { normalizeHandStyle } from "@our-farm/shared";
import type { Crop, CropType, Farm, HandStyle, User } from "@our-farm/shared";

function rowToUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    nickname: row.nickname,
    handStyle: normalizeHandStyle(row.handStyle),
    token: row.token,
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToFarm(row: typeof farms.$inferSelect): Farm {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    type: row.type as Farm["type"],
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
  };
}

function rowToCrop(row: typeof crops.$inferSelect): Crop {
  return {
    id: row.id,
    farmId: row.farmId,
    x: row.x,
    y: row.y,
    cropType: row.cropType as CropType,
    plantedAt: row.plantedAt.getTime(),
    plantedBy: row.plantedBy,
  };
}

export async function createUser(input: { nickname: string; handStyle: HandStyle }): Promise<User> {
  const [row] = await db.insert(users).values({
    nickname: input.nickname,
    handStyle: input.handStyle,
    token: randomUUID(),
  }).returning();
  return rowToUser(row);
}

export async function getUserByToken(token: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.token, token));
  return row ? rowToUser(row) : null;
}

export async function getSharedFarm(): Promise<Farm | null> {
  const [row] = await db.select().from(farms).where(eq(farms.type, "shared"));
  return row ? rowToFarm(row) : null;
}

export async function getFarmCrops(farmId: string): Promise<Crop[]> {
  const rows = await db.select().from(crops).where(eq(crops.farmId, farmId));
  return rows.map(rowToCrop);
}

export async function insertCrop(input: {
  farmId: string;
  x: number;
  y: number;
  cropType: CropType;
  plantedBy: string;
  plantedAt?: number; // epoch ms; default = agora
}): Promise<Crop> {
  const [row] = await db.insert(crops).values({
    farmId: input.farmId,
    x: input.x,
    y: input.y,
    cropType: input.cropType,
    plantedBy: input.plantedBy,
    plantedAt: new Date(input.plantedAt ?? Date.now()),
  }).returning();
  return rowToCrop(row);
}

export async function deleteCropAt(farmId: string, x: number, y: number): Promise<boolean> {
  const deleted = await db.delete(crops)
    .where(and(eq(crops.farmId, farmId), eq(crops.x, x), eq(crops.y, y)))
    .returning({ id: crops.id });
  return deleted.length > 0;
}
```

- [ ] **Step 2: Criar o script de seed**

`apps/server/src/db/seed.ts`:
```ts
import "../env";
import { db, queryClient } from "./client";
import { getSharedFarm } from "./repository";
import { farms } from "./schema";

const existing = await getSharedFarm();
if (existing) {
  console.log("Fazenda compartilhada já existe — nada a fazer.");
} else {
  await db.insert(farms).values({
    name: "Fazenda Compartilhada",
    ownerId: null,
    type: "shared",
    gridWidth: 16,
    gridHeight: 16,
  });
  console.log("Fazenda compartilhada criada.");
}
await queryClient.end();
```

- [ ] **Step 3: Rodar o seed e verificar**

Run: `pnpm db:seed`
Expected: imprime `Fazenda compartilhada criada.`. Rodar de novo imprime `... já existe ...`.

- [ ] **Step 4: Confirmar o typecheck do servidor**

Run: `pnpm --filter @our-farm/server typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/seed.ts apps/server/src/db/repository.ts
git commit -m "feat(server): repository functions + shared farm seed"
```

---

## Task 7: `apps/server` — schema da Room, FarmRoom (presença) e entrypoint (TDD)

**Files:**
- Create: `apps/server/src/rooms/schema.ts`, `apps/server/src/rooms/FarmRoom.ts`, `apps/server/src/app.config.ts`, `apps/server/src/index.ts`, `apps/server/src/http/routes.ts`, `apps/server/src/test/db-helpers.ts`, `apps/server/vitest.config.ts`, `apps/server/src/rooms/FarmRoom.test.ts`

- [ ] **Step 1: Criar o schema de estado da Room**

`apps/server/src/rooms/schema.ts`:
```ts
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Cursor extends Schema {
  @type("string") userId = "";
  @type("string") nickname = "";
  @type("string") handColor = "#ffcc00";
  @type("string") handShape = "point";
  @type("number") x = 0;
  @type("number") y = 0;
}

export class CropState extends Schema {
  @type("string") cropType = "";
  @type("number") plantedAt = 0;
  @type("string") plantedBy = "";
}

export class FarmState extends Schema {
  @type("string") farmId = "";
  @type("number") gridWidth = 16;
  @type("number") gridHeight = 16;
  @type({ map: Cursor }) cursors = new MapSchema<Cursor>();
  @type({ map: CropState }) crops = new MapSchema<CropState>();
}

/** Chave usada no MapSchema `crops`. */
export const tileKey = (x: number, y: number): string => `${x},${y}`;
```

- [ ] **Step 2: Criar a rota HTTP placeholder (preenchida na Task 10)**

`apps/server/src/http/routes.ts`:
```ts
import type { Express } from "express";

/** Rotas HTTP de identidade. Implementadas na Task 10. */
export function registerRoutes(app: Express): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
}
```

- [ ] **Step 3: Criar os helpers de teste**

`apps/server/src/test/db-helpers.ts`:
```ts
import { db } from "../db/client";
import { crops, farms, users } from "../db/schema";
import { createUser } from "../db/repository";
import type { Farm, HandStyle, User } from "@our-farm/shared";

/** Limpa as três tabelas — chamado antes de cada teste. */
export async function resetDb(): Promise<void> {
  await db.delete(crops);
  await db.delete(farms);
  await db.delete(users);
}

/** Cria uma fazenda compartilhada de teste. */
export async function seedSharedFarm(): Promise<Farm> {
  const [row] = await db.insert(farms).values({
    name: "Fazenda de Teste",
    ownerId: null,
    type: "shared",
    gridWidth: 16,
    gridHeight: 16,
  }).returning();
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    type: "shared",
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
  };
}

export async function makeUser(nickname = "Tester"): Promise<User> {
  const handStyle: HandStyle = { color: "#ff8800", shape: "point" };
  return createUser({ nickname, handStyle });
}
```

- [ ] **Step 4: Criar a config do Vitest**

`apps/server/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/env.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 5: Escrever o teste de presença que falha**

`apps/server/src/rooms/FarmRoom.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../app.config";
import { queryClient } from "../db/client";
import { resetDb, seedSharedFarm, makeUser } from "../test/db-helpers";

describe("FarmRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); await queryClient.end(); });
  beforeEach(async () => { await colyseus.cleanup(); await resetDb(); });

  it("cria um cursor para o cliente que entrou", async () => {
    await seedSharedFarm();
    const user = await makeUser("Alice");
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    await room.waitForNextPatch();

    expect(room.state.cursors.size).toBe(1);
    expect(room.state.cursors.get(client.sessionId)?.nickname).toBe("Alice");
  });

  it("rejeita cliente com token inválido", async () => {
    await seedSharedFarm();
    const room = await colyseus.createRoom("farm", {});
    await expect(colyseus.connectTo(room, { token: "bogus" })).rejects.toBeDefined();
  });

  it("atualiza a posição do cursor na mensagem 'cursor'", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("cursor", { x: 120, y: 80 });
    await room.waitForNextPatch();

    expect(room.state.cursors.get(client.sessionId)?.x).toBe(120);
    expect(room.state.cursors.get(client.sessionId)?.y).toBe(80);
  });

  it("remove o cursor quando o cliente sai", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    await room.waitForNextPatch();
    await client.leave();
    await room.waitForNextPatch();

    expect(room.state.cursors.size).toBe(0);
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Garanta que o Postgres está no ar e migrado (`docker compose up -d` e `pnpm db:migrate` da Task 5).
Run: `pnpm --filter @our-farm/server test`
Expected: FAIL — `Failed to resolve import "../app.config"` (o entrypoint e o `FarmRoom` ainda não existem; são criados nos Steps 7-8).

- [ ] **Step 7: Implementar o FarmRoom (presença: onCreate / onAuth / onJoin / onLeave / cursor)**

`apps/server/src/rooms/FarmRoom.ts`:
```ts
import { Room, type Client } from "colyseus";
import type { User, CursorMessage } from "@our-farm/shared";
import { FarmState, Cursor, CropState, tileKey } from "./schema";
import { getSharedFarm, getFarmCrops, getUserByToken } from "../db/repository";

export class FarmRoom extends Room<FarmState> {
  async onCreate(): Promise<void> {
    const farm = await getSharedFarm();
    if (!farm) throw new Error("fazenda compartilhada não foi semeada (rode pnpm db:seed)");

    const state = new FarmState();
    state.farmId = farm.id;
    state.gridWidth = farm.gridWidth;
    state.gridHeight = farm.gridHeight;

    const crops = await getFarmCrops(farm.id);
    for (const crop of crops) {
      const cropState = new CropState();
      cropState.cropType = crop.cropType;
      cropState.plantedAt = crop.plantedAt;
      cropState.plantedBy = crop.plantedBy;
      state.crops.set(tileKey(crop.x, crop.y), cropState);
    }
    this.setState(state);

    this.onMessage("cursor", (client, message: CursorMessage) => {
      this.handleCursor(client, message);
    });
  }

  async onAuth(_client: Client, options: { token?: string }): Promise<User> {
    const user = options.token ? await getUserByToken(options.token) : null;
    if (!user) throw new Error("token inválido");
    return user;
  }

  onJoin(client: Client, _options: unknown, user: User): void {
    const cursor = new Cursor();
    cursor.userId = user.id;
    cursor.nickname = user.nickname;
    cursor.handColor = user.handStyle.color;
    cursor.handShape = user.handStyle.shape;
    this.state.cursors.set(client.sessionId, cursor);
  }

  onLeave(client: Client): void {
    this.state.cursors.delete(client.sessionId);
  }

  private handleCursor(client: Client, message: CursorMessage): void {
    const cursor = this.state.cursors.get(client.sessionId);
    if (!cursor) return;
    if (typeof message?.x !== "number" || typeof message?.y !== "number") return;
    cursor.x = message.x;
    cursor.y = message.y;
  }
}
```

- [ ] **Step 8: Criar `app.config.ts` e `index.ts`**

`apps/server/src/app.config.ts`:
```ts
import config from "@colyseus/tools";
import express from "express";
import cors from "cors";
import { FarmRoom } from "./rooms/FarmRoom";
import { registerRoutes } from "./http/routes";

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define("farm", FarmRoom);
  },
  initializeExpress: (app) => {
    app.use(cors());
    app.use(express.json({ limit: "32kb" }));
    registerRoutes(app);
  },
});
```

`apps/server/src/index.ts`:
```ts
import "./env";
import { listen } from "@colyseus/tools";
import app from "./app.config";

listen(app);
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @our-farm/server test`
Expected: PASS — 4 testes do `FarmRoom` verdes.

- [ ] **Step 10: Verificar que o servidor sobe**

Run: `pnpm --filter @our-farm/server dev` (deixe rodar ~3s, observe o log, depois encerre com Ctrl-C)
Expected: log do Colyseus indicando que está ouvindo na porta 2567, sem stack trace.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src apps/server/vitest.config.ts
git commit -m "feat(server): FarmRoom presence (cursors) + colyseus app config"
```

---

## Task 8: `apps/server` — mensagem `plant` (TDD)

**Files:**
- Modify: `apps/server/src/rooms/FarmRoom.ts`
- Modify (adicionar testes): `apps/server/src/rooms/FarmRoom.test.ts`

- [ ] **Step 1: Adicionar os testes de `plant` que falham**

Adicione este bloco `describe` ao fim de `apps/server/src/rooms/FarmRoom.test.ts`, depois do `describe("FarmRoom", ...)` existente.

Primeiro, adicione esta linha de import no topo do arquivo de teste (o teste de `plant` consulta o banco para confirmar a persistência):
```ts
import { getFarmCrops } from "../db/repository";
```

Novo bloco de testes (cole no fim do arquivo):
```ts
describe("FarmRoom — plant", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); await resetDb(); });

  it("planta numa terra vazia e persiste no banco", async () => {
    const farm = await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 3, y: 5, cropType: "carrot" });
    await room.waitForNextPatch();

    expect(room.state.crops.get("3,5")?.cropType).toBe("carrot");
    expect(await getFarmCrops(farm.id)).toHaveLength(1);
  });

  it("rejeita plantar em terra ocupada", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 1, y: 1, cropType: "carrot" });
    await room.waitForNextPatch();
    client.send("plant", { x: 1, y: 1, cropType: "corn" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(1);
    expect(room.state.crops.get("1,1")?.cropType).toBe("carrot");
  });

  it("rejeita plantar fora do grid", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 99, y: 0, cropType: "carrot" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });

  it("rejeita cultura desconhecida", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 2, y: 2, cropType: "banana" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que os de `plant` falham**

Run: `pnpm --filter @our-farm/server test`
Expected: FAIL — os 4 novos testes de `plant` falham (a mensagem `plant` ainda não é tratada; `crops` continua vazio).

- [ ] **Step 3: Implementar o handler de `plant` no FarmRoom**

Em `apps/server/src/rooms/FarmRoom.ts`, atualize os imports e adicione o handler.

Imports (substitua a linha de import de `@our-farm/shared` e a de repository):
```ts
import type { User, CursorMessage, PlantMessage } from "@our-farm/shared";
import { validatePlant } from "@our-farm/shared";
import { getSharedFarm, getFarmCrops, getUserByToken, insertCrop } from "../db/repository";
```

Em `onCreate`, registre o novo handler logo após o `onMessage("cursor", ...)`:
```ts
    this.onMessage("plant", (client, message: PlantMessage) => {
      void this.handlePlant(client, message);
    });
```

Adicione o método privado à classe (depois de `handleCursor`):
```ts
  private async handlePlant(client: Client, message: PlantMessage): Promise<void> {
    const user = client.auth as User | undefined;
    if (!user) return;
    if (typeof message?.x !== "number" || typeof message?.y !== "number") return;

    const result = validatePlant({
      x: message.x,
      y: message.y,
      cropType: message.cropType,
      occupied: this.state.crops.has(tileKey(message.x, message.y)),
      gridWidth: this.state.gridWidth,
      gridHeight: this.state.gridHeight,
    });
    if (!result.ok) return;

    // Persiste primeiro; só reflete no estado da Room se o banco confirmar.
    const crop = await insertCrop({
      farmId: this.state.farmId,
      x: message.x,
      y: message.y,
      cropType: result.cropType,
      plantedBy: user.id,
    });

    const cropState = new CropState();
    cropState.cropType = crop.cropType;
    cropState.plantedAt = crop.plantedAt;
    cropState.plantedBy = crop.plantedBy;
    this.state.crops.set(tileKey(message.x, message.y), cropState);
  }
```

Nota sobre `client.auth`: o valor retornado por `onAuth` fica acessível em `client.auth`. Se a sua versão do Colyseus expuser o usuário em `client.userData` em vez de `client.auth`, ajuste o acesso — o teste do Step 4 confirma qual funciona.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @our-farm/server test`
Expected: PASS — todos os testes do `FarmRoom` (presença + plant) verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/FarmRoom.ts apps/server/src/rooms/FarmRoom.test.ts
git commit -m "feat(server): plant message — validate, persist, sync"
```

---

## Task 9: `apps/server` — mensagem `harvest` (TDD)

**Files:**
- Modify: `apps/server/src/rooms/FarmRoom.ts`
- Modify (adicionar testes): `apps/server/src/rooms/FarmRoom.test.ts`

- [ ] **Step 1: Adicionar os testes de `harvest` que falham**

No topo de `apps/server/src/rooms/FarmRoom.test.ts`, adicione `insertCrop` ao import do repositório:
```ts
import { getFarmCrops, insertCrop } from "../db/repository";
```
Adicione também ao import de `@our-farm/shared` (no topo do arquivo de teste) a constante do catálogo:
```ts
import { CROP_CATALOG } from "@our-farm/shared";
```

Cole este bloco no fim do arquivo:
```ts
describe("FarmRoom — harvest", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); await resetDb(); });

  it("colhe uma cultura pronta e remove do banco", async () => {
    const farm = await seedSharedFarm();
    const user = await makeUser();
    // cultura plantada bem no passado → já pronta
    await insertCrop({
      farmId: farm.id, x: 2, y: 2, cropType: "carrot", plantedBy: user.id,
      plantedAt: Date.now() - CROP_CATALOG.carrot.growthMs - 5000,
    });
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("harvest", { x: 2, y: 2 });
    await room.waitForNextPatch();

    expect(room.state.crops.has("2,2")).toBe(false);
    expect(await getFarmCrops(farm.id)).toHaveLength(0);
  });

  it("rejeita colher cultura que ainda não cresceu", async () => {
    const farm = await seedSharedFarm();
    const user = await makeUser();
    await insertCrop({
      farmId: farm.id, x: 4, y: 4, cropType: "corn", plantedBy: user.id,
      plantedAt: Date.now(), // recém-plantada
    });
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("harvest", { x: 4, y: 4 });
    await room.waitForNextPatch();

    expect(room.state.crops.has("4,4")).toBe(true);
    expect(await getFarmCrops(farm.id)).toHaveLength(1);
  });

  it("ignora colheita em terra vazia", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("harvest", { x: 7, y: 7 });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que os de `harvest` falham**

Run: `pnpm --filter @our-farm/server test`
Expected: FAIL — o primeiro teste de `harvest` falha (a mensagem `harvest` não é tratada; a cultura pronta continua no estado).

- [ ] **Step 3: Implementar o handler de `harvest` no FarmRoom**

Em `apps/server/src/rooms/FarmRoom.ts`:

Atualize os imports de `@our-farm/shared` e do repositório:
```ts
import type { User, CursorMessage, PlantMessage, HarvestMessage, CropType } from "@our-farm/shared";
import { validatePlant, validateHarvest } from "@our-farm/shared";
import { getSharedFarm, getFarmCrops, getUserByToken, insertCrop, deleteCropAt } from "../db/repository";
```

Em `onCreate`, registre o handler após o `onMessage("plant", ...)`:
```ts
    this.onMessage("harvest", (client, message: HarvestMessage) => {
      void this.handleHarvest(client, message);
    });
```

Adicione o método privado à classe:
```ts
  private async handleHarvest(client: Client, message: HarvestMessage): Promise<void> {
    const user = client.auth as User | undefined;
    if (!user) return;
    if (typeof message?.x !== "number" || typeof message?.y !== "number") return;

    const key = tileKey(message.x, message.y);
    const crop = this.state.crops.get(key);

    const result = validateHarvest({
      cropType: crop ? (crop.cropType as CropType) : null,
      plantedAt: crop ? crop.plantedAt : null,
      now: Date.now(),
    });
    if (!result.ok) return;

    // Persiste primeiro; só reflete no estado da Room se o banco confirmar.
    const removed = await deleteCropAt(this.state.farmId, message.x, message.y);
    if (removed) {
      this.state.crops.delete(key);
    }
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @our-farm/server test`
Expected: PASS — todos os testes do `FarmRoom` (presença + plant + harvest) verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/FarmRoom.ts apps/server/src/rooms/FarmRoom.test.ts
git commit -m "feat(server): harvest message — validate ripeness, persist, sync"
```

---

## Task 10: `apps/server` — rotas HTTP de identidade (TDD)

**Files:**
- Modify: `apps/server/src/http/routes.ts`
- Create: `apps/server/src/http/routes.test.ts`

- [ ] **Step 1: Escrever o teste das rotas que falha**

`apps/server/src/http/routes.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../app.config";
import { queryClient } from "../db/client";
import { resetDb } from "../test/db-helpers";

describe("rotas de identidade", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); await queryClient.end(); });
  beforeEach(async () => { await resetDb(); });

  it("POST /api/register cria um usuário e devolve token", async () => {
    const res = await colyseus.http.post("/api/register", {
      nickname: "Bob",
      handStyle: { color: "#00ff00", shape: "open" },
    });
    expect(res.data.userId).toBeTruthy();
    expect(res.data.token).toBeTruthy();
  });

  it("POST /api/register rejeita apelido vazio", async () => {
    const res = await colyseus.http.post("/api/register", { nickname: "  " });
    expect(res.status).toBe(400);
  });

  it("GET /api/me devolve o usuário para um token válido", async () => {
    const reg = await colyseus.http.post("/api/register", {
      nickname: "Carol",
      handStyle: { color: "#abcdef", shape: "pinch" },
    });
    const me = await colyseus.http.get("/api/me", {
      headers: { authorization: `Bearer ${reg.data.token}` },
    });
    expect(me.data.user.nickname).toBe("Carol");
    expect(me.data.user.handStyle.shape).toBe("pinch");
  });

  it("GET /api/me devolve 401 para token inválido", async () => {
    const me = await colyseus.http.get("/api/me", {
      headers: { authorization: "Bearer nope" },
    });
    expect(me.status).toBe(401);
  });
});
```

Nota: o objeto `colyseus.http` do `@colyseus/testing` segue a API do `httpie`/axios — `.post(url, body)` e `.get(url, { headers })`, com a resposta em `res.data` e o código em `res.status`. Se a sua versão expuser nomes ligeiramente diferentes, ajuste no Step 2 após ver o erro.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @our-farm/server test`
Expected: FAIL — as rotas `/api/register` e `/api/me` ainda não existem (404 / dados ausentes).

- [ ] **Step 3: Implementar as rotas de identidade**

Substitua todo o conteúdo de `apps/server/src/http/routes.ts`:
```ts
import type { Express, Request } from "express";
import { normalizeHandStyle } from "@our-farm/shared";
import { createUser, getUserByToken } from "../db/repository";

function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1] : null;
}

export function registerRoutes(app: Express): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/register", async (req, res) => {
    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim() : "";
    if (!nickname) {
      res.status(400).json({ error: "apelido obrigatório" });
      return;
    }
    const handStyle = normalizeHandStyle(req.body?.handStyle);
    const user = await createUser({ nickname, handStyle });
    res.json({ userId: user.id, token: user.token });
  });

  app.get("/api/me", async (req, res) => {
    const token = bearerToken(req);
    const user = token ? await getUserByToken(token) : null;
    if (!user) {
      res.status(401).json({ error: "token inválido" });
      return;
    }
    res.json({ user });
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @our-farm/server test`
Expected: PASS — todos os testes do servidor (FarmRoom + rotas) verdes.

- [ ] **Step 5: Confirmar o typecheck do servidor**

Run: `pnpm --filter @our-farm/server typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/http
git commit -m "feat(server): identity HTTP routes (register, me)"
```

---

## Task 11: `apps/web` — esqueleto Vite + Phaser e grid vazio

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/config.ts`, `apps/web/src/game/constants.ts`, `apps/web/src/game/FarmScene.ts`, `apps/web/src/main.ts`, `apps/web/src/ui/styles.css`

- [ ] **Step 1: Criar `package.json` e `tsconfig.json` do cliente**

`apps/web/package.json`:
```json
{
  "name": "@our-farm/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 2: Instalar as dependências do cliente**

Run:
```bash
pnpm --filter @our-farm/web add phaser colyseus.js
pnpm --filter @our-farm/web add -D vite typescript vitest
pnpm --filter @our-farm/web add "@our-farm/shared@workspace:*"
```
Expected: `package.json` do cliente populado; `@our-farm/shared` linkado.

- [ ] **Step 3: Criar `vite.config.ts` e `index.html`**

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
});
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Our Farm</title>
  </head>
  <body>
    <div id="app">
      <div id="game"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Criar `config.ts`, `constants.ts` e `styles.css`**

`apps/web/src/config.ts`:
```ts
export const SERVER_HTTP = "http://localhost:2567";
export const SERVER_WS = "ws://localhost:2567";
```

`apps/web/src/game/constants.ts`:
```ts
/** Lado de um tile em pixels. */
export const TILE = 40;

/** Cores do tabuleiro. */
export const COLORS = {
  soil: 0x8d6e4a,
  soilAlt: 0x9c7b54,
  grid: 0x6b5234,
};
```

`apps/web/src/ui/styles.css`:
```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #2f3a1f;
  color: #f4f4e8;
  display: flex;
  justify-content: center;
  padding: 24px;
}
#game canvas { display: block; border-radius: 8px; }
```

- [ ] **Step 5: Criar a cena Phaser (só o grid, por enquanto)**

`apps/web/src/game/FarmScene.ts`:
```ts
import Phaser from "phaser";
import { TILE, COLORS } from "./constants";

export interface FarmSceneData {
  cols: number;
  rows: number;
}

export class FarmScene extends Phaser.Scene {
  private cols = 16;
  private rows = 16;

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.cols = data.cols;
    this.rows = data.rows;
  }

  create(): void {
    this.drawGrid();
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const checker = (x + y) % 2 === 0;
        g.fillStyle(checker ? COLORS.soil : COLORS.soilAlt, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    g.lineStyle(1, COLORS.grid, 0.5);
    for (let x = 0; x <= this.cols; x++) {
      g.lineBetween(x * TILE, 0, x * TILE, this.rows * TILE);
    }
    for (let y = 0; y <= this.rows; y++) {
      g.lineBetween(0, y * TILE, this.cols * TILE, y * TILE);
    }
  }
}
```

- [ ] **Step 6: Criar `main.ts` (inicialização provisória)**

Esta versão de `main.ts` só sobe o Phaser com um grid fixo 16×16. Ela é substituída na Task 13, quando a conexão real entra.

`apps/web/src/main.ts`:
```ts
import "./ui/styles.css";
import Phaser from "phaser";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { TILE } from "./game/constants";

const cols = 16;
const rows = 16;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: cols * TILE,
  height: rows * TILE,
  backgroundColor: "#2f3a1f",
});

game.scene.add("farm", FarmScene, true, { cols, rows } satisfies FarmSceneData);
```

- [ ] **Step 7: Rodar o cliente e verificar o grid**

Run: `pnpm --filter @our-farm/web dev` (deixe rodar; abra `http://localhost:5173`)
Expected: o navegador mostra um tabuleiro 16×16 de tiles de terra em xadrez. Sem erros no console. Encerre com Ctrl-C.

- [ ] **Step 8: Confirmar o typecheck do cliente**

Run: `pnpm --filter @our-farm/web typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold vite + phaser, render farm grid"
```

---

## Task 12: `apps/web` — cliente HTTP, identidade e overlay de cadastro

**Files:**
- Create: `apps/web/src/api.ts`, `apps/web/src/identity.ts`, `apps/web/src/ui/registerOverlay.ts`
- Modify: `apps/web/src/ui/styles.css`

- [ ] **Step 1: Criar o cliente HTTP de identidade**

`apps/web/src/api.ts`:
```ts
import { SERVER_HTTP } from "./config";
import type { HandStyle, User } from "@our-farm/shared";

export interface RegisterResult {
  userId: string;
  token: string;
}

export async function registerUser(nickname: string, handStyle: HandStyle): Promise<RegisterResult> {
  const res = await fetch(`${SERVER_HTTP}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, handStyle }),
  });
  if (!res.ok) throw new Error(`registro falhou (${res.status})`);
  return res.json() as Promise<RegisterResult>;
}

export async function fetchMe(token: string): Promise<User | null> {
  const res = await fetch(`${SERVER_HTTP}/api/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: User };
  return body.user;
}
```

- [ ] **Step 2: Adicionar o CSS do overlay**

Adicione ao fim de `apps/web/src/ui/styles.css`:
```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 26, 12, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
}
.overlay__card {
  background: #3c4a26;
  padding: 28px 32px;
  border-radius: 12px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.overlay__card h1 { margin: 0; font-size: 20px; }
.overlay__card label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.overlay__card input, .overlay__card select {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #6b7a48;
  background: #2f3a1f;
  color: #f4f4e8;
}
.overlay__card button {
  margin-top: 6px;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #ffcc00;
  color: #2f3a1f;
  font-weight: 700;
  cursor: pointer;
}
.overlay__error { color: #ff9a8a; font-size: 12px; min-height: 14px; }
```

- [ ] **Step 3: Criar o overlay de cadastro**

`apps/web/src/ui/registerOverlay.ts`:
```ts
import { HAND_SHAPES, DEFAULT_HAND_STYLE } from "@our-farm/shared";
import type { HandStyle } from "@our-farm/shared";
import { registerUser, type RegisterResult } from "../api";

const SHAPE_LABELS: Record<string, string> = {
  point: "Apontando",
  open: "Aberta",
  pinch: "Pinça",
};

/**
 * Mostra o formulário de cadastro e resolve com o token quando o usuário
 * registra um apelido + mãozinha. Remove o overlay do DOM ao concluir.
 */
export function showRegisterOverlay(): Promise<RegisterResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <form class="overlay__card">
        <h1>Bem-vindo à Our Farm</h1>
        <label>Apelido
          <input name="nickname" maxlength="20" autocomplete="off" required />
        </label>
        <label>Cor da mãozinha
          <input name="color" type="color" value="${DEFAULT_HAND_STYLE.color}" />
        </label>
        <label>Estilo da mãozinha
          <select name="shape">
            ${HAND_SHAPES.map(
              (s) => `<option value="${s}">${SHAPE_LABELS[s] ?? s}</option>`,
            ).join("")}
          </select>
        </label>
        <div class="overlay__error"></div>
        <button type="submit">Entrar na fazenda</button>
      </form>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form") as HTMLFormElement;
    const errorEl = overlay.querySelector(".overlay__error") as HTMLDivElement;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const nickname = String(data.get("nickname") ?? "").trim();
      if (!nickname) {
        errorEl.textContent = "Escolha um apelido.";
        return;
      }
      const handStyle: HandStyle = {
        color: String(data.get("color") ?? DEFAULT_HAND_STYLE.color),
        shape: String(data.get("shape") ?? DEFAULT_HAND_STYLE.shape) as HandStyle["shape"],
      };
      errorEl.textContent = "";
      try {
        const result = await registerUser(nickname, handStyle);
        overlay.remove();
        resolve(result);
      } catch {
        errorEl.textContent = "Não foi possível registrar. O servidor está rodando?";
      }
    });
  });
}
```

- [ ] **Step 4: Criar o módulo de identidade**

`apps/web/src/identity.ts`:
```ts
import { fetchMe } from "./api";
import { showRegisterOverlay } from "./ui/registerOverlay";
import type { User } from "@our-farm/shared";

const TOKEN_KEY = "our-farm:token";

/**
 * Garante uma identidade válida: reaproveita o token do localStorage se ainda
 * for válido; senão mostra o overlay de cadastro. Resolve com o token e o User.
 */
export async function ensureIdentity(): Promise<{ token: string; user: User }> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    const user = await fetchMe(stored);
    if (user) return { token: stored, user };
    localStorage.removeItem(TOKEN_KEY);
  }

  const registered = await showRegisterOverlay();
  localStorage.setItem(TOKEN_KEY, registered.token);
  const user = await fetchMe(registered.token);
  if (!user) throw new Error("registro concluído mas /api/me falhou");
  return { token: registered.token, user };
}
```

- [ ] **Step 5: Verificar o fluxo de cadastro manualmente**

Garanta que o Postgres está no ar e que o servidor está rodando (`pnpm --filter @our-farm/server dev` num terminal). Esta verificação usa um `main.ts` temporário — depois ele é finalizado na Task 13. Por ora, edite `apps/web/src/main.ts` para chamar `ensureIdentity` e logar o resultado, mantendo o resto:

No topo de `apps/web/src/main.ts`, abaixo dos imports existentes, adicione:
```ts
import { ensureIdentity } from "./identity";

ensureIdentity()
  .then(({ user }) => console.log("identidade:", user.nickname, user.handStyle))
  .catch((err) => console.error(err));
```

Run: `pnpm --filter @our-farm/web dev` e abra `http://localhost:5173`.
Expected: o overlay de cadastro aparece; ao preencher e enviar, o overlay some e o console loga `identidade: <apelido> {color, shape}`. Recarregar a página NÃO mostra o overlay de novo (token reaproveitado). Encerre com Ctrl-C.

- [ ] **Step 6: Confirmar o typecheck do cliente**

Run: `pnpm --filter @our-farm/web typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/identity.ts apps/web/src/ui apps/web/src/main.ts
git commit -m "feat(web): identity flow — register overlay + token persistence"
```

---

## Task 13: `apps/web` — conexão Colyseus e presença das mãozinhas

**Files:**
- Create: `apps/web/src/net/room.ts`
- Modify: `apps/web/src/game/FarmScene.ts`, `apps/web/src/main.ts`

- [ ] **Step 1: Criar o módulo de conexão Colyseus**

`apps/web/src/net/room.ts`:
```ts
import { Client, type Room } from "colyseus.js";
import { SERVER_WS } from "../config";

/**
 * Forma do estado da Room espelhada pelo colyseus.js. Os MapSchema expõem
 * `.forEach`, `.get`, `.has` e `.size`, exatamente como no servidor.
 */
export interface CursorView {
  userId: string;
  nickname: string;
  handColor: string;
  handShape: string;
  x: number;
  y: number;
}
export interface CropView {
  cropType: string;
  plantedAt: number;
  plantedBy: string;
}
export interface FarmStateView {
  farmId: string;
  gridWidth: number;
  gridHeight: number;
  cursors: {
    forEach(cb: (value: CursorView, key: string) => void): void;
    get(key: string): CursorView | undefined;
    size: number;
  };
  crops: {
    forEach(cb: (value: CropView, key: string) => void): void;
    get(key: string): CropView | undefined;
    has(key: string): boolean;
    size: number;
  };
}

export type FarmRoom = Room<FarmStateView>;

/**
 * Conecta no servidor, entra na Room da fazenda compartilhada e só resolve
 * depois que o primeiro snapshot de estado chegou — assim quem chama já lê
 * `gridWidth`/`crops` populados.
 */
export async function connectToFarm(token: string): Promise<FarmRoom> {
  const client = new Client(SERVER_WS);
  const room = await client.joinOrCreate<FarmStateView>("farm", { token });
  if (!room.state.farmId) {
    await new Promise<void>((resolve) => {
      room.onStateChange.once(() => resolve());
    });
  }
  return room;
}
```

- [ ] **Step 2: Reescrever a `FarmScene` para renderizar cursores**

Substitua todo o conteúdo de `apps/web/src/game/FarmScene.ts`:
```ts
import Phaser from "phaser";
import { TILE, COLORS } from "./constants";
import type { FarmRoom } from "../net/room";

export interface FarmSceneData {
  room: FarmRoom;
  cols: number;
  rows: number;
}

const CURSOR_THROTTLE_MS = 50;

export class FarmScene extends Phaser.Scene {
  private room!: FarmRoom;
  private cols = 16;
  private rows = 16;
  private cursorSprites = new Map<string, Phaser.GameObjects.Container>();
  private lastCursorSent = 0;

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.room = data.room;
    this.cols = data.cols;
    this.rows = data.rows;
  }

  create(): void {
    this.drawGrid();
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
  }

  update(): void {
    this.syncCursors();
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const checker = (x + y) % 2 === 0;
        g.fillStyle(checker ? COLORS.soil : COLORS.soilAlt, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    g.lineStyle(1, COLORS.grid, 0.5);
    for (let x = 0; x <= this.cols; x++) {
      g.lineBetween(x * TILE, 0, x * TILE, this.rows * TILE);
    }
    for (let y = 0; y <= this.rows; y++) {
      g.lineBetween(0, y * TILE, this.cols * TILE, y * TILE);
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const now = this.time.now;
    if (now - this.lastCursorSent < CURSOR_THROTTLE_MS) return;
    this.lastCursorSent = now;
    this.room.send("cursor", { x: Math.round(pointer.worldX), y: Math.round(pointer.worldY) });
  }

  /** Reconcilia os containers de cursor com o estado da Room a cada frame. */
  private syncCursors(): void {
    const seen = new Set<string>();
    this.room.state.cursors.forEach((cursor, sessionId) => {
      if (sessionId === this.room.sessionId) return; // não desenha o próprio
      seen.add(sessionId);
      let sprite = this.cursorSprites.get(sessionId);
      if (!sprite) {
        sprite = this.createCursorSprite(cursor.handColor, cursor.nickname);
        this.cursorSprites.set(sessionId, sprite);
      }
      sprite.setPosition(cursor.x, cursor.y);
    });
    for (const [sessionId, sprite] of this.cursorSprites) {
      if (!seen.has(sessionId)) {
        sprite.destroy();
        this.cursorSprites.delete(sessionId);
      }
    }
  }

  private createCursorSprite(color: string, nickname: string): Phaser.GameObjects.Container {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    const hand = this.add.triangle(0, 0, 0, 0, 0, 20, 14, 14, tint).setOrigin(0, 0);
    const label = this.add.text(16, 14, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 4, y: 2 },
    });
    return this.add.container(0, 0, [hand, label]);
  }
}
```

- [ ] **Step 3: Reescrever `main.ts` para conectar antes de iniciar o jogo**

Substitua todo o conteúdo de `apps/web/src/main.ts`:
```ts
import "./ui/styles.css";
import Phaser from "phaser";
import { ensureIdentity } from "./identity";
import { connectToFarm } from "./net/room";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { TILE } from "./game/constants";

async function main(): Promise<void> {
  const { token } = await ensureIdentity();
  const room = await connectToFarm(token);

  const cols = room.state.gridWidth;
  const rows = room.state.gridHeight;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: cols * TILE,
    height: rows * TILE,
    backgroundColor: "#2f3a1f",
  });

  game.scene.add("farm", FarmScene, true, { room, cols, rows } satisfies FarmSceneData);
}

void main();
```

- [ ] **Step 4: Verificar a presença ao vivo com duas abas**

Suba tudo: `docker compose up -d`, depois `pnpm dev` (turbo sobe `web` e `server` juntos).
Abra `http://localhost:5173` em **duas abas** e cadastre um apelido diferente em cada.
Expected: ao mover o mouse numa aba, a mãozinha colorida com o apelido aparece e se move **na outra aba**, ao vivo. Fechar uma aba remove a mãozinha dela na outra.

- [ ] **Step 5: Confirmar o typecheck do cliente**

Run: `pnpm --filter @our-farm/web typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/net apps/web/src/game/FarmScene.ts apps/web/src/main.ts
git commit -m "feat(web): connect to colyseus, render live hand cursors"
```

---

## Task 14: `apps/web` — plantar/colher, render de culturas e seletor

**Files:**
- Create: `apps/web/src/ui/hud.ts`
- Modify: `apps/web/src/game/FarmScene.ts`, `apps/web/src/main.ts`, `apps/web/src/ui/styles.css`, `apps/web/index.html`

- [ ] **Step 1: Adicionar o container do HUD ao HTML e o CSS**

Em `apps/web/index.html`, troque o `<div id="app">` por:
```html
    <div id="app">
      <div id="game"></div>
      <div id="hud"></div>
    </div>
```

Adicione ao fim de `apps/web/src/ui/styles.css`:
```css
#app { display: flex; flex-direction: column; gap: 12px; align-items: center; }
#hud { display: flex; gap: 8px; }
.hud__crop {
  padding: 8px 14px;
  border: 2px solid transparent;
  border-radius: 8px;
  background: #3c4a26;
  color: #f4f4e8;
  cursor: pointer;
  font-size: 13px;
}
.hud__crop--active { border-color: #ffcc00; }
```

- [ ] **Step 2: Criar o HUD seletor de cultura**

`apps/web/src/ui/hud.ts`:
```ts
import { CROP_TYPES, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";

export interface Hud {
  /** Cultura atualmente selecionada para plantar. */
  readonly selectedCrop: CropType;
}

/** Monta a barra de seleção de cultura e devolve o estado vivo do HUD. */
export function createHud(): Hud {
  const container = document.getElementById("hud");
  if (!container) throw new Error("#hud não encontrado");

  let selected: CropType = CROP_TYPES[0];
  const buttons = new Map<CropType, HTMLButtonElement>();

  for (const cropType of CROP_TYPES) {
    const button = document.createElement("button");
    button.className = "hud__crop";
    button.textContent = CROP_CATALOG[cropType].label;
    button.addEventListener("click", () => {
      selected = cropType;
      for (const [type, el] of buttons) {
        el.classList.toggle("hud__crop--active", type === selected);
      }
    });
    buttons.set(cropType, button);
    container.appendChild(button);
  }
  buttons.get(selected)?.classList.add("hud__crop--active");

  return {
    get selectedCrop() {
      return selected;
    },
  };
}
```

- [ ] **Step 3: Adicionar plantio/colheita e render de culturas à `FarmScene`**

Substitua todo o conteúdo de `apps/web/src/game/FarmScene.ts`:
```ts
import Phaser from "phaser";
import { getCropStage, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";
import { TILE, COLORS } from "./constants";
import type { FarmRoom } from "../net/room";
import type { Hud } from "../ui/hud";

export interface FarmSceneData {
  room: FarmRoom;
  hud: Hud;
  cols: number;
  rows: number;
}

const CURSOR_THROTTLE_MS = 50;

const CROP_COLORS: Record<CropType, number> = {
  carrot: 0xff8c1a,
  corn: 0xf2c14e,
};

export class FarmScene extends Phaser.Scene {
  private room!: FarmRoom;
  private hud!: Hud;
  private cols = 16;
  private rows = 16;
  private cursorSprites = new Map<string, Phaser.GameObjects.Container>();
  private cropSprites = new Map<string, Phaser.GameObjects.Arc>();
  private lastCursorSent = 0;

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.room = data.room;
    this.hud = data.hud;
    this.cols = data.cols;
    this.rows = data.rows;
  }

  create(): void {
    this.drawGrid();
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  update(): void {
    this.syncCursors();
    this.syncCrops();
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const checker = (x + y) % 2 === 0;
        g.fillStyle(checker ? COLORS.soil : COLORS.soilAlt, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    g.lineStyle(1, COLORS.grid, 0.5);
    for (let x = 0; x <= this.cols; x++) {
      g.lineBetween(x * TILE, 0, x * TILE, this.rows * TILE);
    }
    for (let y = 0; y <= this.rows; y++) {
      g.lineBetween(0, y * TILE, this.cols * TILE, y * TILE);
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const now = this.time.now;
    if (now - this.lastCursorSent < CURSOR_THROTTLE_MS) return;
    this.lastCursorSent = now;
    this.room.send("cursor", { x: Math.round(pointer.worldX), y: Math.round(pointer.worldY) });
  }

  /** Clique numa terra: colhe se houver cultura pronta, senão planta. */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const tx = Math.floor(pointer.worldX / TILE);
    const ty = Math.floor(pointer.worldY / TILE);
    if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return;

    const crop = this.room.state.crops.get(`${tx},${ty}`);
    if (crop) {
      const stage = getCropStage(crop.cropType as CropType, crop.plantedAt, Date.now());
      if (stage.harvestable) {
        this.room.send("harvest", { x: tx, y: ty });
      }
      return;
    }
    this.room.send("plant", { x: tx, y: ty, cropType: this.hud.selectedCrop });
  }

  private syncCursors(): void {
    const seen = new Set<string>();
    this.room.state.cursors.forEach((cursor, sessionId) => {
      if (sessionId === this.room.sessionId) return;
      seen.add(sessionId);
      let sprite = this.cursorSprites.get(sessionId);
      if (!sprite) {
        sprite = this.createCursorSprite(cursor.handColor, cursor.nickname);
        this.cursorSprites.set(sessionId, sprite);
      }
      sprite.setPosition(cursor.x, cursor.y);
    });
    for (const [sessionId, sprite] of this.cursorSprites) {
      if (!seen.has(sessionId)) {
        sprite.destroy();
        this.cursorSprites.delete(sessionId);
      }
    }
  }

  /** Reconcilia as culturas e ajusta o raio conforme o estágio de crescimento. */
  private syncCrops(): void {
    const now = Date.now();
    const seen = new Set<string>();
    this.room.state.crops.forEach((crop, key) => {
      seen.add(key);
      const [tx, ty] = key.split(",").map(Number);
      const cropType = crop.cropType as CropType;
      const def = CROP_CATALOG[cropType];
      const { stage, harvestable } = getCropStage(cropType, crop.plantedAt, now);
      const radius = 4 + ((stage + 1) / def.stages) * (TILE / 2 - 6);

      let sprite = this.cropSprites.get(key);
      if (!sprite) {
        sprite = this.add.circle(
          tx * TILE + TILE / 2,
          ty * TILE + TILE / 2,
          radius,
          CROP_COLORS[cropType],
        );
        this.cropSprites.set(key, sprite);
      }
      sprite.setRadius(radius);
      sprite.setStrokeStyle(harvestable ? 3 : 0, 0xffffff);
    });
    for (const [key, sprite] of this.cropSprites) {
      if (!seen.has(key)) {
        sprite.destroy();
        this.cropSprites.delete(key);
      }
    }
  }

  private createCursorSprite(color: string, nickname: string): Phaser.GameObjects.Container {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    const hand = this.add.triangle(0, 0, 0, 0, 0, 20, 14, 14, tint).setOrigin(0, 0);
    const label = this.add.text(16, 14, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 4, y: 2 },
    });
    return this.add.container(0, 0, [hand, label]);
  }
}
```

- [ ] **Step 4: Ligar o HUD no `main.ts`**

Substitua todo o conteúdo de `apps/web/src/main.ts`:
```ts
import "./ui/styles.css";
import Phaser from "phaser";
import { ensureIdentity } from "./identity";
import { connectToFarm } from "./net/room";
import { createHud } from "./ui/hud";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { TILE } from "./game/constants";

async function main(): Promise<void> {
  const { token } = await ensureIdentity();
  const room = await connectToFarm(token);
  const hud = createHud();

  const cols = room.state.gridWidth;
  const rows = room.state.gridHeight;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: cols * TILE,
    height: rows * TILE,
    backgroundColor: "#2f3a1f",
  });

  game.scene.add("farm", FarmScene, true, { room, hud, cols, rows } satisfies FarmSceneData);
}

void main();
```

- [ ] **Step 5: Verificar o loop completo com duas abas**

Suba tudo: `docker compose up -d` e `pnpm dev`. Abra `http://localhost:5173` em duas abas, cadastrando apelidos diferentes.
Expected:
- Clicar numa terra vazia planta a cultura selecionada no HUD — um círculo colorido aparece **nas duas abas**.
- O círculo cresce ao longo do tempo (cenoura ~30s, milho ~120s) e ganha um contorno branco quando fica pronto.
- Clicar numa cultura pronta a colhe — o círculo some **nas duas abas**.
- Clicar numa cultura ainda crescendo não faz nada.
- Recarregar a página mantém as culturas plantadas (persistência).

- [ ] **Step 6: Confirmar o typecheck do cliente**

Run: `pnpm --filter @our-farm/web typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/web/index.html apps/web/src/ui apps/web/src/game/FarmScene.ts apps/web/src/main.ts
git commit -m "feat(web): plant/harvest interaction + crop rendering by stage"
```

---

## Task 15: `.claude/settings.json`

**Files:**
- Create: `.claude/settings.json`

- [ ] **Step 1: Criar a allowlist de permissões do projeto**

`.claude/settings.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm dev:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm typecheck:*)",
      "Bash(pnpm --filter:*)",
      "Bash(pnpm db:generate:*)",
      "Bash(pnpm db:migrate:*)",
      "Bash(pnpm db:seed:*)",
      "Bash(turbo run:*)",
      "Bash(docker compose:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)"
    ]
  }
}
```

- [ ] **Step 2: Verificar que o JSON é válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "chore: add .claude/settings.json permission allowlist"
```

---

## Task 16: `CLAUDE.md`

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Escrever o `CLAUDE.md`**

Escreva `CLAUDE.md` na raiz do repositório com exatamente este conteúdo:
```markdown
# Our Farm

Jogo de fazenda web multiplayer em tempo real. Jogadores compartilham uma
fazenda e se veem como mãozinhas flutuantes (estilo Figma). Marco 1: presença
ao vivo + loop plantar → crescer → colher.

## Monorepo

- `packages/shared` — tipos do domínio + regras de jogo puras (isomórfico, sem
  I/O). Toda regra de jogo mora aqui.
- `apps/server` — Colyseus (cada fazenda = uma Room) + rotas HTTP de identidade
  + Postgres via Drizzle. Schema e migrations em `apps/server/drizzle`.
- `apps/web` — Vite + Phaser 3 + cliente Colyseus.

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
```

- [ ] **Step 2: Verificação final — suíte completa e typecheck**

Garanta que o Postgres está no ar (`docker compose up -d`).
Run: `pnpm test && pnpm typecheck`
Expected: todos os testes verdes em `@our-farm/shared` e `@our-farm/server`; typecheck sem erros nos três pacotes.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with project conventions"
```

---

## Notas de execução

- **Postgres precisa estar no ar** para as Tasks 5-10 (testes de servidor são
  integração) e para qualquer verificação manual do jogo. Suba com
  `docker compose up -d` uma vez e deixe rodando.
- **Risco de drift de API do Colyseus 0.16:** os pontos mais prováveis de
  precisar de ajuste fino são (a) o entrypoint `@colyseus/tools`
  (`config`/`listen`), (b) o acesso ao usuário autenticado — `client.auth` vs
  `client.userData`, e (c) a API de `colyseus.http` no `@colyseus/testing`. Cada
  um desses tem um teste que falha de forma clara se o ajuste for necessário;
  siga o ciclo TDD e adapte conforme o erro.
- **Decorators sob o Vitest:** se os decorators `@type` do Colyseus Schema
  derem erro nos testes do servidor, confirme que o `tsconfig.json` do servidor
  estende a base (que tem `experimentalDecorators` e `useDefineForClassFields`).

## Cobertura do spec

| Seção do spec | Task(s) |
|---|---|
| §3 Stack / §4 Monorepo | 1, 2, 5, 11 |
| §4 `packages/shared` | 2, 3, 4 |
| §5 Modelo de dados | 5 (schema), 6 (repositório/seed) |
| §6 Estado da Room / real-time | 7 (schema + presença), 13 (cliente) |
| §7 Regras (crescimento, validação, ordem persistir→estado, concorrência) | 3, 4, 8, 9 |
| §8 Fluxo de identidade | 10 (rotas), 12 (cliente) |
| §9 Dev local | 1 (docker/env/turbo), comandos ao longo do plano |
| §10 Testes | 3, 4 (shared TDD), 7-10 (server `@colyseus/testing`) |
| §11 Escopo do Marco 1 (loop, 2 culturas, grid 16×16) | 2 (catálogo), 14 (loop completo) |
| §13 Tooling do Claude Code | 15 (`settings.json`), 16 (`CLAUDE.md`) |
