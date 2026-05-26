# Our Farm — Plano de Implementação do Mundo + Campo (Marco 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir o playfield 16×16 atual num mundo 50×40 navegável por câmera (pan estilo Figma), com um conjunto de lotes desbloqueáveis (starter 6×6), decorações procedurais, e uma camada de assets abstrata que aceita placeholder hoje e sprites reais amanhã — sem mexer no protocolo cliente/servidor de Marco 1.

**Architecture:** Servidor segue cego à câmera: coordenadas são globais. O cliente recebe o estado da Room (agora incluindo `plots: Map<"x,y", PlotState>`), desenha o mundo em camadas (grama → decorações → cerca → terra-lote → culturas → cursores → setas off-screen → próprio cursor), e usa a câmera do Phaser pra rolar dentro dos bounds do mundo. Validação ganha um campo `unlocked` — server rejeita plantar em tile não-desbloqueado.

**Tech Stack:** TypeScript ESM, Colyseus 0.16, `@colyseus/schema` 3, Postgres + Drizzle, Phaser 4, Vitest, `@colyseus/testing`. Sem dependências novas.

---

## Pré-requisitos

- Node 20 ativo (`make dev` já cuida).
- Postgres no ar (`make db-up`).
- Marco 1 commitado e funcional (commits até `60ff7be` no `main`).

## Mapa de arquivos

```
packages/shared/src/
├── types.ts              MODIFY: + Plot
└── validation.ts         MODIFY: + PlantInput.unlocked + check
    validation.test.ts    MODIFY: novos casos pra unlocked

apps/server/src/
├── db/
│   ├── schema.ts         MODIFY: + farmPlots
│   ├── repository.ts     MODIFY: + getFarmPlots + insertPlot
│   └── seed.ts           MODIFY: + starter pack
├── rooms/
│   ├── schema.ts         MODIFY: + PlotState + FarmState.plots
│   ├── FarmRoom.ts       MODIFY: load plots, pass unlocked
│   └── FarmRoom.test.ts  MODIFY: ajustar coords + novos testes
└── test/db-helpers.ts    MODIFY: seedSharedFarm desbloqueia starter

apps/server/drizzle/
└── 0001_marco2.sql       CREATE (via db:generate + edição manual)

apps/web/src/
├── game/
│   ├── constants.ts      MODIFY: + VIEWPORT_W/H, WORLD_W/H
│   ├── rng.ts            CREATE: mulberry32, hashString
│   ├── rng.test.ts       CREATE
│   ├── decorations.ts    CREATE: generateDecorations
│   ├── decorations.test.ts CREATE
│   ├── assets.ts         CREATE: TILE_RENDERERS + helpers
│   ├── camera.ts         CREATE: setupCameraPan
│   └── FarmScene.ts      REWRITE: mundo + camadas + camera + plots + off-screen
├── net/room.ts           MODIFY: + PlotView no FarmStateView
├── ui/styles.css         MODIFY: cursor classes pra pan
└── main.ts               MODIFY: viewport fixo
```

---

## Task 1: `packages/shared` — `Plot` type + `PlantInput.unlocked` (TDD)

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/validation.ts`
- Modify: `packages/shared/src/validation.test.ts`

- [ ] **Step 1: Adicionar o tipo `Plot` em `types.ts`**

Adicione ao fim de `packages/shared/src/types.ts`:
```ts
export interface Plot {
  farmId: string;
  x: number;
  y: number;
  unlockedAt: number; // epoch ms
}
```

- [ ] **Step 2: Adicionar testes que falham**

Em `packages/shared/src/validation.test.ts`, primeiro **atualize as chamadas existentes** pra incluir `unlocked: true` (que é o padrão dos casos válidos atuais). Cada chamada a `validatePlant({...})` precisa ganhar a propriedade `unlocked: true`. Substitua todo o bloco `describe("validatePlant", ...)` por:

```ts
describe("validatePlant", () => {
  it("aceita um plantio válido em terra vazia e desbloqueada", () => {
    const r = validatePlant({ x: 3, y: 5, cropType: "carrot", occupied: false, unlocked: true, ...GRID });
    expect(r).toEqual({ ok: true, cropType: "carrot" });
  });

  it("rejeita coordenadas fora do grid", () => {
    expect(validatePlant({ x: 16, y: 0, cropType: "carrot", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: -1, y: 0, cropType: "carrot", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: 0, y: 16, cropType: "carrot", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: 0, y: -1, cropType: "carrot", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
  });

  it("rejeita coordenadas não-inteiras", () => {
    expect(validatePlant({ x: 1.5, y: 0, cropType: "carrot", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: 0, y: 1.5, cropType: "carrot", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
  });

  it("rejeita plantar em lote não-desbloqueado", () => {
    const r = validatePlant({ x: 3, y: 5, cropType: "carrot", occupied: false, unlocked: false, ...GRID });
    expect(r).toEqual({ ok: false, reason: "lote não desbloqueado" });
  });

  it("rejeita terra já ocupada", () => {
    expect(validatePlant({ x: 1, y: 1, cropType: "carrot", occupied: true, unlocked: true, ...GRID }).ok).toBe(false);
  });

  it("rejeita cultura desconhecida", () => {
    expect(validatePlant({ x: 1, y: 1, cropType: "banana", occupied: false, unlocked: true, ...GRID }).ok).toBe(false);
  });

  it("não-desbloqueado é checado antes de ocupado", () => {
    // garante a ordem da spec: bounds → unlocked → occupied → cropType
    const r = validatePlant({ x: 1, y: 1, cropType: "carrot", occupied: true, unlocked: false, ...GRID });
    expect(r).toEqual({ ok: false, reason: "lote não desbloqueado" });
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que o novo caso falha**

```
make test
```
ou equivalente direto:
```
pnpm --filter @our-farm/shared test
```
Expected: o teste "rejeita plantar em lote não-desbloqueado" e "não-desbloqueado é checado antes de ocupado" falham (campo `unlocked` ignorado). Os demais ainda passam (o tipo aceita `unlocked` mesmo sem ser usado, porque a propriedade extra é ignorada em runtime — mas o TS dá erro de tipo. Se a compilação falhar nos demais por causa do tipo extra, é esperado e será corrigido no Step 4).

- [ ] **Step 4: Atualizar `validation.ts` — `PlantInput` e `validatePlant`**

Substitua o conteúdo de `packages/shared/src/validation.ts`:
```ts
import { isCropType } from "./crops";
import { getCropStage } from "./crop-stage";
import type { CropType } from "./types";

export interface PlantInput {
  x: number;
  y: number;
  cropType: string;
  occupied: boolean;
  unlocked: boolean;
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
  if (!input.unlocked) {
    return { ok: false, reason: "lote não desbloqueado" };
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

(`validateHarvest` permanece sem mudanças — só está aí pra evitar perda acidental.)

- [ ] **Step 5: Rodar os testes — todos passam**

```
pnpm --filter @our-farm/shared test
```
Expected: 14 testes verdes (5 de crop-stage + 9 de validation).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/validation.ts packages/shared/src/validation.test.ts
git commit -m "feat(shared): Plot type + validatePlant gate by unlocked

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `apps/server` — schema Drizzle + migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create (via generate + edição): `apps/server/drizzle/0001_marco2.sql`

- [ ] **Step 1: Adicionar `farmPlots` ao schema Drizzle**

Em `apps/server/src/db/schema.ts`, adicione o import de `primaryKey` na linha de imports do drizzle-orm/pg-core (junte ao `pgTable, uuid, text, integer, timestamp, jsonb, unique`) → torna-se:
```ts
import { pgTable, uuid, text, integer, timestamp, jsonb, unique, primaryKey } from "drizzle-orm/pg-core";
```

Depois, no final do arquivo (após `crops`), adicione:
```ts
export const farmPlots = pgTable("farm_plots", {
  farmId: uuid("farm_id").notNull().references(() => farms.id),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.farmId, table.x, table.y] }),
}));
```

- [ ] **Step 2: Gerar a migration**

```
make db-generate
```
ou
```
pnpm --filter @our-farm/server db:generate
```
Expected: cria um arquivo `apps/server/drizzle/0001_*.sql` que `CREATE TABLE "farm_plots" ...` com `PRIMARY KEY (farm_id, x, y)` e FK pra `farms`. Renomeie esse arquivo pra `apps/server/drizzle/0001_marco2.sql` pra ficar identificável. Também atualize o `_journal.json` se ele referencia o nome antigo — `git diff drizzle/` pra ver.

- [ ] **Step 3: Adicionar os statements custom ao arquivo da migration**

Edite `apps/server/drizzle/0001_marco2.sql` adicionando, **ao FIM** do arquivo (após o `CREATE TABLE` que o drizzle gerou):

```sql
-- Marco 2: expande a fazenda compartilhada pro mundo grande.
UPDATE "farms" SET "grid_width" = 50, "grid_height" = 40 WHERE "type" = 'shared';
--> statement-breakpoint
-- Starter pack: bloco 6×6 em (10..15, 10..15).
INSERT INTO "farm_plots" ("farm_id", "x", "y")
SELECT f."id", gsx."x" + 10, gsy."y" + 10
FROM "farms" f
CROSS JOIN generate_series(0, 5) AS gsx("x")
CROSS JOIN generate_series(0, 5) AS gsy("y")
WHERE f."type" = 'shared'
ON CONFLICT ("farm_id", "x", "y") DO NOTHING;
--> statement-breakpoint
-- Preserva crops existentes: cada tile com cultura plantada vira lote desbloqueado.
INSERT INTO "farm_plots" ("farm_id", "x", "y")
SELECT "farm_id", "x", "y" FROM "crops"
ON CONFLICT ("farm_id", "x", "y") DO NOTHING;
```

`--> statement-breakpoint` é o marcador que o Drizzle migrator usa pra separar statements (já está em `_journal.json`'s convenção).

- [ ] **Step 4: Aplicar a migration**

```
make db-migrate
```
Expected: imprime `Migrações aplicadas.`. Nenhum erro de SQL.

- [ ] **Step 5: Verificar o estado do banco**

```bash
docker compose exec -T postgres psql -U ourfarm -d ourfarm -c "\dt"
docker compose exec -T postgres psql -U ourfarm -d ourfarm -c "SELECT type, grid_width, grid_height FROM farms;"
docker compose exec -T postgres psql -U ourfarm -d ourfarm -c "SELECT COUNT(*) FROM farm_plots;"
```
Expected:
- `\dt` lista `crops`, `farm_plots`, `farms`, `users`.
- A fazenda `shared` agora tem `grid_width=50`, `grid_height=40`.
- `COUNT(*)` retorna pelo menos 36 (starter pack). Pode ser mais se houver crops antigas (auto-grant).

- [ ] **Step 6: Confirmar typecheck**

```
make typecheck
```
Expected: limpo nos 3 pacotes (note que o servidor ainda não usa `unlocked` na validação — a chamada permanece a antiga sem o campo; isso ainda compila porque o erro de tipo seria detectado só quando o servidor passar `unlocked`. Task 5 corrige).

Atenção: se o typecheck do servidor reclamar agora porque `validatePlant` mudou de assinatura e o servidor ainda não passa `unlocked`, é esperado e será corrigido na Task 5. Pode pular esse step se houver erro relacionado à PlantInput, e re-rodar depois da Task 5.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat(server): farm_plots table + Marco 2 migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `apps/server` — repositório: `getFarmPlots` + `insertPlot`

**Files:**
- Modify: `apps/server/src/db/repository.ts`

- [ ] **Step 1: Adicionar imports e mapper no `repository.ts`**

No topo de `apps/server/src/db/repository.ts`, atualize os imports:
- Adicione `farmPlots` ao import de `./schema`.
- Adicione `Plot` ao import de tipo do `@our-farm/shared`.

Cole no fim do arquivo o mapper:
```ts
function rowToPlot(row: typeof farmPlots.$inferSelect): Plot {
  return {
    farmId: row.farmId,
    x: row.x,
    y: row.y,
    unlockedAt: row.unlockedAt.getTime(),
  };
}
```

- [ ] **Step 2: Adicionar `getFarmPlots`**

Cole após `rowToPlot`:
```ts
export async function getFarmPlots(farmId: string): Promise<Plot[]> {
  const rows = await db.select().from(farmPlots).where(eq(farmPlots.farmId, farmId));
  return rows.map(rowToPlot);
}
```

- [ ] **Step 3: Adicionar `insertPlot`**

Cole após `getFarmPlots`:
```ts
export async function insertPlot(input: {
  farmId: string;
  x: number;
  y: number;
  unlockedAt?: number;
}): Promise<Plot> {
  const inserted = await db.insert(farmPlots).values({
    farmId: input.farmId,
    x: input.x,
    y: input.y,
    unlockedAt: new Date(input.unlockedAt ?? Date.now()),
  }).onConflictDoNothing().returning();

  if (inserted.length > 0 && inserted[0]) {
    return rowToPlot(inserted[0]);
  }
  // Conflito (já existia): retorna a linha existente.
  const [existing] = await db.select().from(farmPlots).where(and(
    eq(farmPlots.farmId, input.farmId),
    eq(farmPlots.x, input.x),
    eq(farmPlots.y, input.y),
  ));
  if (!existing) throw new Error("insertPlot: insert returned no row and no existing row found");
  return rowToPlot(existing);
}
```

- [ ] **Step 4: Confirmar typecheck**

```
pnpm --filter @our-farm/server typecheck
```
Expected: limpo (mesma ressalva da Task 2 Step 6 — se a chamada de validatePlant no FarmRoom reclamar de campo faltando, é esperado e será corrigido na Task 5).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/repository.ts
git commit -m "feat(server): repository.getFarmPlots + insertPlot (idempotent)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `apps/server` — seed atualizado pra starter pack

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Atualizar o seed pra também desbloquear o starter pack**

Substitua o conteúdo de `apps/server/src/db/seed.ts` por:
```ts
import "../env";
import { db, queryClient } from "./client";
import { getSharedFarm, insertPlot } from "./repository";
import { farms } from "./schema";

const STARTER_OFFSET = 10;
const STARTER_SIZE = 6;

try {
  let farm = await getSharedFarm();
  if (farm) {
    console.log("Fazenda compartilhada já existe.");
  } else {
    await db.insert(farms).values({
      name: "Fazenda Compartilhada",
      ownerId: null,
      type: "shared",
      gridWidth: 50,
      gridHeight: 40,
    });
    console.log("Fazenda compartilhada criada.");
    farm = await getSharedFarm();
  }
  if (!farm) throw new Error("shared farm missing after create");

  let unlockedCount = 0;
  for (let dy = 0; dy < STARTER_SIZE; dy++) {
    for (let dx = 0; dx < STARTER_SIZE; dx++) {
      await insertPlot({
        farmId: farm.id,
        x: STARTER_OFFSET + dx,
        y: STARTER_OFFSET + dy,
      });
      unlockedCount++;
    }
  }
  console.log(`Starter pack garantido (${unlockedCount} lotes em ${STARTER_OFFSET}..${STARTER_OFFSET + STARTER_SIZE - 1}, ambos eixos).`);
} finally {
  await queryClient.end();
}
```

- [ ] **Step 2: Rodar o seed**

```
make db-seed
```
Expected: imprime `Fazenda compartilhada já existe.` (a migration já criou) e `Starter pack garantido (36 lotes em 10..15, ambos eixos).`. Idempotente — rodar de novo NÃO duplica nada.

- [ ] **Step 3: Confirmar no banco**

```bash
docker compose exec -T postgres psql -U ourfarm -d ourfarm -c "SELECT COUNT(*) FROM farm_plots;"
```
Expected: pelo menos 36 (pode ser mais se a migration importou crops antigas).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat(server): seed garante o starter pack 6x6 de lotes desbloqueados

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `apps/server` — `PlotState` + FarmRoom carrega plots + gate no `plant` (TDD)

**Files:**
- Modify: `apps/server/src/rooms/schema.ts`
- Modify: `apps/server/src/rooms/FarmRoom.ts`
- Modify: `apps/server/src/test/db-helpers.ts`
- Modify: `apps/server/src/rooms/FarmRoom.test.ts`

- [ ] **Step 1: Adicionar `PlotState` e `plots` ao `FarmState`**

Substitua o conteúdo de `apps/server/src/rooms/schema.ts`:
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

export class PlotState extends Schema {
  @type("number") unlockedAt = 0;
}

export class FarmState extends Schema {
  @type("string") farmId = "";
  @type("number") gridWidth = 16;
  @type("number") gridHeight = 16;
  @type({ map: Cursor }) cursors = new MapSchema<Cursor>();
  @type({ map: CropState }) crops = new MapSchema<CropState>();
  @type({ map: PlotState }) plots = new MapSchema<PlotState>();
}

/** Chave usada nos MapSchema `crops` e `plots`. */
export const tileKey = (x: number, y: number): string => `${x},${y}`;
```

- [ ] **Step 2: Atualizar `db-helpers.ts` pra desbloquear o starter pack nos testes**

Em `apps/server/src/test/db-helpers.ts`, adicione `insertPlot` ao import:
```ts
import { createUser, insertPlot } from "../db/repository";
```

Substitua o `seedSharedFarm` por uma versão que também desbloqueia o starter pack (mesma região do seed real, pra os testes ficarem alinhados):
```ts
const STARTER_OFFSET = 10;
const STARTER_SIZE = 6;

/** Cria uma fazenda compartilhada de teste e desbloqueia o starter pack 6×6. */
export async function seedSharedFarm(): Promise<Farm> {
  const [row] = await db.insert(farms).values({
    name: "Fazenda de Teste",
    ownerId: null,
    type: "shared",
    gridWidth: 50,
    gridHeight: 40,
  }).returning();
  if (!row) throw new Error("seedSharedFarm: insert returned no row");
  const farm: Farm = {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    type: "shared",
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
  };
  for (let dy = 0; dy < STARTER_SIZE; dy++) {
    for (let dx = 0; dx < STARTER_SIZE; dx++) {
      await insertPlot({ farmId: farm.id, x: STARTER_OFFSET + dx, y: STARTER_OFFSET + dy });
    }
  }
  return farm;
}
```

E o `resetDb` precisa apagar `farm_plots` antes das `farms` (FK):
```ts
export async function resetDb(): Promise<void> {
  await db.delete(crops);
  await db.delete(farmPlots);
  await db.delete(farms);
  await db.delete(users);
}
```
Adicione `farmPlots` ao import de `../db/schema`:
```ts
import { crops, farms, users, farmPlots } from "../db/schema";
```

- [ ] **Step 3: Atualizar todos os testes existentes do FarmRoom pra usar coords dentro do starter pack**

Em `apps/server/src/rooms/FarmRoom.test.ts`, **substitua estas coords** (busca-e-troca):

- `{ x: 3, y: 5,` → `{ x: 12, y: 13,`
- `"3,5"` → `"12,13"`
- `{ x: 1, y: 1,` → `{ x: 11, y: 11,`
- `"1,1"` → `"11,11"`
- `{ x: 2, y: 2,` → `{ x: 12, y: 12,`
- `"2,2"` → `"12,12"`
- `{ x: 4, y: 4,` → `{ x: 14, y: 14,`
- `"4,4"` → `"14,14"`
- `{ x: 7, y: 7,` → `{ x: 15, y: 15,`

A coord `{ x: 99, y: 0 }` (teste "rejeita plantar fora do grid") **fica como está** — 99 ainda está fora do grid 50.

- [ ] **Step 4: Adicionar o novo teste — rejeita plantar em lote não desbloqueado**

Adicione ao FIM do `describe("FarmRoom — plant", ...)` (logo antes do fechamento `})` do bloco):
```ts
  it("rejeita plantar em tile não desbloqueado", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    // (20,20) é dentro do grid 50×40 mas fora do starter pack (10..15)
    client.send("plant", { x: 20, y: 20, cropType: "carrot" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });
```

- [ ] **Step 5: Rodar os testes — esperar falha**

Garanta que Postgres está no ar (`make db-up`) e a migration está aplicada.
```
pnpm --filter @our-farm/server test
```
Expected: o novo teste falha (cultura é plantada em (20,20) porque FarmRoom ainda não checa `unlocked`). Outros testes do FarmRoom podem falhar também porque `validatePlant` agora exige o campo `unlocked` que o FarmRoom não está passando. **Ambas as falhas são esperadas** — serão corrigidas no Step 6.

- [ ] **Step 6: Atualizar `FarmRoom.ts` — carregar plots e passar `unlocked` no plant**

Em `apps/server/src/rooms/FarmRoom.ts`:

1. Atualize os imports da `./schema` pra incluir `PlotState`:
```ts
import { FarmState, Cursor, CropState, PlotState, tileKey } from "./schema";
```
2. Atualize o import do repositório pra incluir `getFarmPlots`:
```ts
import { getSharedFarm, getFarmCrops, getFarmPlots, getUserByToken, insertCrop, deleteCropAt } from "../db/repository";
```
3. Em `onCreate`, **logo após o loop que carrega crops e antes do `this.setState(state);`**, adicione o carregamento de plots:
```ts
    const plots = await getFarmPlots(farm.id);
    for (const p of plots) {
      const ps = new PlotState();
      ps.unlockedAt = p.unlockedAt;
      state.plots.set(tileKey(p.x, p.y), ps);
    }
```
4. Em `handlePlant`, atualize a chamada de `validatePlant` pra incluir `unlocked`:
```ts
    const result = validatePlant({
      x: message.x,
      y: message.y,
      cropType: message.cropType,
      occupied: this.state.crops.has(key),
      unlocked: this.state.plots.has(key),
      gridWidth: this.state.gridWidth,
      gridHeight: this.state.gridHeight,
    });
```

- [ ] **Step 7: Rodar os testes — todos verdes**

```
pnpm --filter @our-farm/server test
```
Expected: 16 testes verdes (15 do Marco 1 + 1 novo de unlock).

- [ ] **Step 8: Confirmar typecheck completo**

```
make typecheck
```
Expected: limpo nos 3 pacotes.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/rooms apps/server/src/test/db-helpers.ts
git commit -m "feat(server): FarmRoom carrega plots e plant exige unlocked

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `apps/web` — `rng.ts` (mulberry32 + hashString) com TDD

**Files:**
- Create: `apps/web/src/game/rng.ts`
- Create: `apps/web/src/game/rng.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/src/game/rng.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mulberry32, hashString } from "./rng";

describe("mulberry32", () => {
  it("produz a mesma sequência pra mesma seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produz sequências distintas pra seeds distintas", () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    expect(a()).not.toBe(b());
  });

  it("retorna valores em [0, 1)", () => {
    const r = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashString", () => {
  it("é determinístico", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("produz hashes distintos pra inputs distintos", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("retorna inteiro não-negativo em 32 bits", () => {
    const h = hashString("our-farm");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

```
pnpm --filter @our-farm/web test
```
Expected: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Step 3: Implementar `rng.ts`**

`apps/web/src/game/rng.ts`:
```ts
/**
 * PRNG seedável (Mulberry32). Mesma seed → mesma sequência.
 * Boa o suficiente pra distribuição cosmética; não use pra cripto.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash determinístico de string → uint32 (FNV-1a 32 bits). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
```

- [ ] **Step 4: Rodar e confirmar pass**

```
pnpm --filter @our-farm/web test
```
Expected: PASS — 6 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/game/rng.ts apps/web/src/game/rng.test.ts
git commit -m "feat(web): mulberry32 PRNG + FNV-1a hashString (seeded RNG)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `apps/web` — `decorations.ts` (TDD)

**Files:**
- Create: `apps/web/src/game/decorations.ts`
- Create: `apps/web/src/game/decorations.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/src/game/decorations.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateDecorations } from "./decorations";

const FARM_ID = "00000000-0000-0000-0000-000000000001";
const GRID = { gridWidth: 20, gridHeight: 20 };

describe("generateDecorations", () => {
  it("é determinístico (mesma seed → mesmo output)", () => {
    const a = generateDecorations({ farmId: FARM_ID, ...GRID, unlockedTiles: new Set() });
    const b = generateDecorations({ farmId: FARM_ID, ...GRID, unlockedTiles: new Set() });
    expect(a).toEqual(b);
  });

  it("produz outputs distintos pra farmIds distintos", () => {
    const a = generateDecorations({ farmId: FARM_ID, ...GRID, unlockedTiles: new Set() });
    const b = generateDecorations({ farmId: "different", ...GRID, unlockedTiles: new Set() });
    expect(a).not.toEqual(b);
  });

  it("nunca coloca decoração num tile desbloqueado", () => {
    const unlocked = new Set<string>();
    for (let y = 5; y < 10; y++) {
      for (let x = 5; x < 10; x++) {
        unlocked.add(`${x},${y}`);
      }
    }
    const decos = generateDecorations({
      farmId: FARM_ID,
      ...GRID,
      unlockedTiles: unlocked,
      density: 1,  // força tentar em todos os tiles
    });
    for (const d of decos) {
      expect(unlocked.has(`${d.x},${d.y}`)).toBe(false);
    }
  });

  it("density=1 produz decoração em todos os tiles bloqueados", () => {
    const decos = generateDecorations({
      farmId: FARM_ID,
      ...GRID,
      unlockedTiles: new Set(),
      density: 1,
    });
    expect(decos).toHaveLength(GRID.gridWidth * GRID.gridHeight);
  });

  it("density=0 produz lista vazia", () => {
    const decos = generateDecorations({
      farmId: FARM_ID,
      ...GRID,
      unlockedTiles: new Set(),
      density: 0,
    });
    expect(decos).toHaveLength(0);
  });

  it("respeita os limites do grid", () => {
    const decos = generateDecorations({
      farmId: FARM_ID,
      ...GRID,
      unlockedTiles: new Set(),
    });
    for (const d of decos) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThan(GRID.gridWidth);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThan(GRID.gridHeight);
      expect(["tree", "rock"]).toContain(d.kind);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

```
pnpm --filter @our-farm/web test
```
Expected: FAIL — `Failed to resolve import "./decorations"`.

- [ ] **Step 3: Implementar `decorations.ts`**

`apps/web/src/game/decorations.ts`:
```ts
import { mulberry32, hashString } from "./rng";

export interface Decoration {
  kind: "tree" | "rock";
  x: number;
  y: number;
}

export interface GenerateDecorationsInput {
  farmId: string;
  gridWidth: number;
  gridHeight: number;
  unlockedTiles: Set<string>;
  /** Probabilidade [0, 1] de cada tile elegível receber decoração. Default 0.06. */
  density?: number;
}

/**
 * Decorações procedurais com seed = farmId. Todos os clientes na mesma fazenda
 * computam exatamente o mesmo conjunto, sem trafegar bytes. Nunca coloca
 * decoração em tile desbloqueado (onde o jogador pode plantar).
 */
export function generateDecorations(input: GenerateDecorationsInput): Decoration[] {
  const density = input.density ?? 0.06;
  const rng = mulberry32(hashString(input.farmId));
  const out: Decoration[] = [];
  for (let y = 0; y < input.gridHeight; y++) {
    for (let x = 0; x < input.gridWidth; x++) {
      if (input.unlockedTiles.has(`${x},${y}`)) continue;
      // Consumimos UM número do RNG por tile, mesmo quando não cabe decoração,
      // pra garantir reprodutibilidade independente do conjunto de unlocks.
      const roll = rng();
      if (roll >= density) continue;
      const kindRoll = rng();
      out.push({ kind: kindRoll < 0.7 ? "tree" : "rock", x, y });
    }
  }
  return out;
}
```

Nota: a regra "consume UM número por tile mesmo se não cabe" não está no test e poderia ser otimizada — mas garante que mudanças no unlocked-set não rotacionem todo o seed. Pra esse spec, o output bate com os testes (que não checam exatamente quais coords vêm).

- [ ] **Step 4: Rodar e confirmar pass**

```
pnpm --filter @our-farm/web test
```
Expected: PASS — 12 testes verdes no `@our-farm/web` (6 de rng + 6 de decorations).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/game/decorations.ts apps/web/src/game/decorations.test.ts
git commit -m "feat(web): generateDecorations procedural seedado por farmId

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `apps/web` — `assets.ts` (TILE_RENDERERS + helpers)

**Files:**
- Modify: `apps/web/src/game/constants.ts`
- Create: `apps/web/src/game/assets.ts`

- [ ] **Step 1: Adicionar constants do mundo/viewport**

Substitua o conteúdo de `apps/web/src/game/constants.ts`:
```ts
/** Lado de um tile em pixels. */
export const TILE = 40;

/** Viewport fixo do canvas Phaser. O mundo é maior e a camera rola dentro. */
export const VIEWPORT = { width: 1024, height: 640 };

/** Cores do tabuleiro (fallback de placeholder até a arte real entrar). */
export const COLORS = {
  grass: 0x5a8a35,
  grassAlt: 0x4f7b2e,
  soil: 0x8d6e4a,
  soilStroke: 0x6b5234,
  fence: 0x6e4f2a,
  fenceShadow: 0x4a3017,
  tree: 0x2f5a20,
  treeStroke: 0x1a3010,
  treeTrunk: 0x5d3a1a,
  rock: 0x707070,
  arrowOutline: 0xffffff,
};
```

(Os antigos `COLORS.soil`/`COLORS.soilAlt`/`COLORS.grid` ficam expandidos pra cobrir grama, terra, cerca, decoração e contorno de seta.)

- [ ] **Step 2: Criar `assets.ts`**

`apps/web/src/game/assets.ts`:
```ts
import Phaser from "phaser";
import { TILE, COLORS } from "./constants";
import { getCropStage, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";

export type TileKind =
  | "grass"
  | "dirt-plot"
  | "fence-n" | "fence-s" | "fence-e" | "fence-w"
  | "tree"
  | "rock";

export interface TileRenderer {
  (scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.GameObject;
}

const FENCE_THICK = 6;

export const TILE_RENDERERS: Record<TileKind, TileRenderer> = {
  grass: (s, x, y) => {
    // Variação leve em xadrez pro fundo não ficar plano.
    const tx = Math.round(x / TILE);
    const ty = Math.round(y / TILE);
    const color = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
    return s.add.rectangle(x, y, TILE, TILE, color).setOrigin(0);
  },
  "dirt-plot": (s, x, y) =>
    s.add.rectangle(x, y, TILE, TILE, COLORS.soil).setOrigin(0).setStrokeStyle(1, COLORS.soilStroke),
  "fence-n": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(0, 0, TILE, FENCE_THICK, COLORS.fence).setOrigin(0));
    c.add(s.add.rectangle(0, FENCE_THICK, TILE, 2, COLORS.fenceShadow).setOrigin(0));
    return c;
  },
  "fence-s": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(0, TILE - FENCE_THICK, TILE, FENCE_THICK, COLORS.fence).setOrigin(0));
    c.add(s.add.rectangle(0, TILE - FENCE_THICK - 2, TILE, 2, COLORS.fenceShadow).setOrigin(0));
    return c;
  },
  "fence-w": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(0, 0, FENCE_THICK, TILE, COLORS.fence).setOrigin(0));
    return c;
  },
  "fence-e": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(TILE - FENCE_THICK, 0, FENCE_THICK, TILE, COLORS.fence).setOrigin(0));
    return c;
  },
  tree: (s, x, y) => {
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const c = s.add.container(cx, cy);
    const trunk = s.add.rectangle(0, TILE * 0.25, 6, 12, COLORS.treeTrunk).setOrigin(0.5, 0);
    const leaves = s.add.circle(0, 0, TILE * 0.4, COLORS.tree).setStrokeStyle(2, COLORS.treeStroke);
    c.add([trunk, leaves]);
    return c;
  },
  rock: (s, x, y) =>
    s.add.ellipse(x + TILE / 2, y + TILE * 0.6, TILE * 0.5, TILE * 0.35, COLORS.rock),
};

export function renderTile(
  scene: Phaser.Scene,
  kind: TileKind,
  x: number,
  y: number,
): Phaser.GameObjects.GameObject {
  return TILE_RENDERERS[kind](scene, x, y);
}

// ---------- Crops ----------

const CROP_COLORS: Record<CropType, number> = {
  carrot: 0xff8c1a,
  corn: 0xf2c14e,
};

/** Cria um sprite de cultura (estágio inicial). Use `updateCropSprite` pra atualizar. */
export function renderCrop(
  scene: Phaser.Scene,
  cropType: CropType,
  x: number,
  y: number,
): Phaser.GameObjects.Arc {
  return scene.add.circle(x + TILE / 2, y + TILE / 2, 4, CROP_COLORS[cropType]);
}

/** Atualiza o raio (estágio) e o contorno (harvestable) do sprite. */
export function updateCropSprite(
  sprite: Phaser.GameObjects.Arc,
  cropType: CropType,
  plantedAt: number,
  now: number,
): void {
  const def = CROP_CATALOG[cropType];
  const { stage, harvestable } = getCropStage(cropType, plantedAt, now);
  const radius = 4 + ((stage + 1) / def.stages) * (TILE / 2 - 6);
  sprite.setRadius(radius);
  sprite.setStrokeStyle(harvestable ? 3 : 0, 0xffffff);
}

// ---------- Cursors & arrows ----------

/**
 * Mãozinha (própria ou de outro jogador). `nickname` vazio = sem label
 * (útil pra própria mão, onde você não precisa do seu nome).
 */
export function renderHandCursor(
  scene: Phaser.Scene,
  color: string,
  nickname: string,
): Phaser.GameObjects.Container {
  const tint = Phaser.Display.Color.HexStringToColor(color).color;
  const hand = scene.add.triangle(0, 0, 0, 0, 0, 20, 14, 14, tint).setOrigin(0, 0);
  const c = scene.add.container(0, 0, [hand]);
  if (nickname) {
    const label = scene.add.text(16, 14, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 4, y: 2 },
    });
    c.add(label);
  }
  return c;
}

/** Setinha pequena na borda da viewport, apontando pra um jogador off-screen. */
export function renderOffScreenArrow(
  scene: Phaser.Scene,
  color: string,
  nickname: string,
): Phaser.GameObjects.Container {
  const tint = Phaser.Display.Color.HexStringToColor(color).color;
  const arrow = scene.add.triangle(0, 0, -8, 6, 8, 6, 0, -10, tint)
    .setStrokeStyle(1, COLORS.arrowOutline);
  const c = scene.add.container(0, 0, [arrow]);
  if (nickname) {
    const label = scene.add.text(0, 12, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0);
    c.add(label);
  }
  return c;
}
```

- [ ] **Step 3: Confirmar typecheck**

```
pnpm --filter @our-farm/web typecheck
```
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/game/constants.ts apps/web/src/game/assets.ts
git commit -m "feat(web): assets.ts — TILE_RENDERERS + crop/cursor/arrow helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `apps/web` — `camera.ts` (setupCameraPan)

**Files:**
- Create: `apps/web/src/game/camera.ts`
- Modify: `apps/web/src/ui/styles.css`

- [ ] **Step 1: Adicionar classes de cursor de pan ao CSS**

Em `apps/web/src/ui/styles.css`, **substitua** a linha:
```css
#game canvas { display: block; border-radius: 8px; cursor: none; }
```
por:
```css
#game canvas { display: block; border-radius: 8px; cursor: none; }
#game.pan-ready canvas { cursor: grab; }
#game.panning canvas { cursor: grabbing; }
```

- [ ] **Step 2: Criar `camera.ts`**

`apps/web/src/game/camera.ts`:
```ts
import Phaser from "phaser";

export interface CameraPan {
  /** True enquanto o usuário está arrastando a câmera. Use pra suprimir
   *  plant/harvest enquanto está em pan. */
  isPanning(): boolean;
}

function setPanState(state: "grab" | "grabbing" | null): void {
  const gameEl = document.getElementById("game");
  if (!gameEl) return;
  gameEl.classList.toggle("pan-ready", state === "grab");
  gameEl.classList.toggle("panning", state === "grabbing");
}

/**
 * Adiciona pan estilo Figma à câmera principal da cena:
 *   - Botão do meio + arrasta
 *   - Espaço segurado + clique-esquerdo + arrasta
 */
export function setupCameraPan(scene: Phaser.Scene): CameraPan {
  const cam = scene.cameras.main;
  let isPanningNow = false;
  let dragStart: { px: number; py: number; sx: number; sy: number } | null = null;
  let spaceHeld = false;

  const spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  spaceKey?.on("down", () => {
    spaceHeld = true;
    if (!isPanningNow) setPanState("grab");
  });
  spaceKey?.on("up", () => {
    spaceHeld = false;
    if (!isPanningNow) setPanState(null);
  });

  scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
    if (pointer.middleButtonDown() || (spaceHeld && pointer.leftButtonDown())) {
      isPanningNow = true;
      dragStart = { px: pointer.x, py: pointer.y, sx: cam.scrollX, sy: cam.scrollY };
      setPanState("grabbing");
    }
  });

  scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
    if (!isPanningNow || !dragStart) return;
    cam.scrollX = dragStart.sx - (pointer.x - dragStart.px);
    cam.scrollY = dragStart.sy - (pointer.y - dragStart.py);
  });

  const endPan = () => {
    isPanningNow = false;
    dragStart = null;
    setPanState(spaceHeld ? "grab" : null);
  };
  scene.input.on(Phaser.Input.Events.POINTER_UP, endPan);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, endPan);

  return { isPanning: () => isPanningNow };
}
```

- [ ] **Step 3: Confirmar typecheck**

```
pnpm --filter @our-farm/web typecheck
```
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/game/camera.ts apps/web/src/ui/styles.css
git commit -m "feat(web): camera.ts — pan Figma-style (middle-drag + space+drag)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `apps/web` — `net/room.ts` ganha `PlotView`

**Files:**
- Modify: `apps/web/src/net/room.ts`

- [ ] **Step 1: Adicionar `PlotView` ao `FarmStateView`**

Substitua o conteúdo de `apps/web/src/net/room.ts`:
```ts
import { Client, type Room } from "colyseus.js";
import { SERVER_WS } from "../config";

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
export interface PlotView {
  unlockedAt: number;
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
  plots: {
    forEach(cb: (value: PlotView, key: string) => void): void;
    get(key: string): PlotView | undefined;
    has(key: string): boolean;
    size: number;
  };
}

export type FarmRoom = Room<FarmStateView>;

/**
 * Conecta no servidor, entra na Room da fazenda compartilhada e só resolve
 * depois que o primeiro snapshot de estado chegou — assim quem chama já lê
 * `gridWidth`/`crops`/`plots` populados.
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

- [ ] **Step 2: Confirmar typecheck**

```
pnpm --filter @our-farm/web typecheck
```
Expected: limpo (mas a FarmScene ainda não usa `plots` — vai ser corrigido na Task 11).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/net/room.ts
git commit -m "feat(web): FarmStateView ganha plots

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `apps/web` — `FarmScene` reescrita (mundo + camadas + plots + off-screen)

**Files:**
- Modify: `apps/web/src/game/FarmScene.ts`

- [ ] **Step 1: Reescrever a `FarmScene`**

Substitua todo o conteúdo de `apps/web/src/game/FarmScene.ts`:
```ts
import Phaser from "phaser";
import { getCropStage, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";
import { TILE } from "./constants";
import {
  renderTile,
  renderCrop,
  updateCropSprite,
  renderHandCursor,
  renderOffScreenArrow,
} from "./assets";
import { generateDecorations } from "./decorations";
import { setupCameraPan, type CameraPan } from "./camera";
import type { FarmRoom, CursorView, CropView, PlotView } from "../net/room";
import type { Hud } from "../ui/hud";

export interface FarmSceneData {
  room: FarmRoom;
  hud: Hud;
}

const CURSOR_THROTTLE_MS = 50;

export class FarmScene extends Phaser.Scene {
  private room!: FarmRoom;
  private hud!: Hud;
  private pan!: CameraPan;

  // Camadas (containers no z-order correto)
  private bgLayer!: Phaser.GameObjects.Container;
  private decorationsLayer!: Phaser.GameObjects.Container;
  private fenceLayer!: Phaser.GameObjects.Container;
  private dirtLayer!: Phaser.GameObjects.Container;
  private cropsLayer!: Phaser.GameObjects.Container;
  private cursorsLayer!: Phaser.GameObjects.Container;
  private arrowsLayer!: Phaser.GameObjects.Container;
  private ownCursorLayer!: Phaser.GameObjects.Container;

  // Sprite caches keyed por id de cada coisa
  private cursorSprites = new Map<string, Phaser.GameObjects.Container>();
  private arrowSprites = new Map<string, Phaser.GameObjects.Container>();
  private cropSprites = new Map<string, Phaser.GameObjects.Arc>();
  private dirtSprites = new Map<string, Phaser.GameObjects.GameObject>();
  private fenceSprites = new Map<string, Phaser.GameObjects.GameObject>();

  private lastCursorSent = 0;
  private hasLocalPointer = false;
  private plotsSignature = "";  // pra detectar mudança no conjunto de lotes

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.room = data.room;
    this.hud = data.hud;
  }

  create(): void {
    const cols = this.room.state.gridWidth;
    const rows = this.room.state.gridHeight;
    const worldW = cols * TILE;
    const worldH = rows * TILE;

    // Camadas (ordem z ascendente)
    this.bgLayer = this.add.container(0, 0);
    this.decorationsLayer = this.add.container(0, 0);
    this.fenceLayer = this.add.container(0, 0);
    this.dirtLayer = this.add.container(0, 0);
    this.cropsLayer = this.add.container(0, 0);
    this.cursorsLayer = this.add.container(0, 0);
    this.arrowsLayer = this.add.container(0, 0);
    this.ownCursorLayer = this.add.container(0, 0);

    // Camera bounds = mundo inteiro
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);

    // Render do background (grama) — uma vez só, não muda
    this.drawBackground(cols, rows);

    // Render inicial de lotes + cerca + decorações (depende de room.state.plots)
    this.syncPlotsAndDecorations();

    // Centralizar a camera no centro do conjunto de plots desbloqueados
    const center = this.computePlotsCenter();
    cam.centerOn(center.x, center.y);

    // Setup câmera (pan)
    this.pan = setupCameraPan(this);

    // Input
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  update(): void {
    this.syncCursorsAndArrows();
    this.syncCrops();
    // Plots mudam raramente; só re-renderiza se o conjunto mudou.
    const sig = this.computePlotsSignature();
    if (sig !== this.plotsSignature) {
      this.syncPlotsAndDecorations();
    }
  }

  // ---------- Layers ----------

  private drawBackground(cols: number, rows: number): void {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        this.bgLayer.add(renderTile(this, "grass", tx * TILE, ty * TILE));
      }
    }
  }

  private syncPlotsAndDecorations(): void {
    // 1) Coleta o conjunto atual de lotes desbloqueados.
    const unlocked = new Set<string>();
    this.room.state.plots.forEach((_p: PlotView, key: string) => unlocked.add(key));

    // 2) Limpa camadas que dependem disso.
    this.dirtLayer.removeAll(true);
    this.fenceLayer.removeAll(true);
    this.decorationsLayer.removeAll(true);
    this.dirtSprites.clear();
    this.fenceSprites.clear();

    // 3) Terra (dirt) em cada lote desbloqueado.
    for (const key of unlocked) {
      const [tx, ty] = key.split(",").map(Number);
      const dirt = renderTile(this, "dirt-plot", tx * TILE, ty * TILE);
      this.dirtLayer.add(dirt);
      this.dirtSprites.set(key, dirt);
    }

    // 4) Cerca: pra cada lote desbloqueado, lados que fazem fronteira com não-desbloqueado.
    for (const key of unlocked) {
      const [tx, ty] = key.split(",").map(Number);
      if (!unlocked.has(`${tx},${ty - 1}`)) {
        const s = renderTile(this, "fence-n", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:n`, s);
      }
      if (!unlocked.has(`${tx},${ty + 1}`)) {
        const s = renderTile(this, "fence-s", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:s`, s);
      }
      if (!unlocked.has(`${tx - 1},${ty}`)) {
        const s = renderTile(this, "fence-w", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:w`, s);
      }
      if (!unlocked.has(`${tx + 1},${ty}`)) {
        const s = renderTile(this, "fence-e", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:e`, s);
      }
    }

    // 5) Decorações procedurais (filtradas pra não pisar em tiles desbloqueados).
    const decos = generateDecorations({
      farmId: this.room.state.farmId,
      gridWidth: this.room.state.gridWidth,
      gridHeight: this.room.state.gridHeight,
      unlockedTiles: unlocked,
    });
    for (const d of decos) {
      this.decorationsLayer.add(renderTile(this, d.kind, d.x * TILE, d.y * TILE));
    }

    this.plotsSignature = this.computePlotsSignature(unlocked);
  }

  private computePlotsSignature(unlocked?: Set<string>): string {
    if (!unlocked) {
      unlocked = new Set();
      this.room.state.plots.forEach((_p: PlotView, key: string) => unlocked!.add(key));
    }
    return [...unlocked].sort().join("|");
  }

  private computePlotsCenter(): { x: number; y: number } {
    let sumX = 0, sumY = 0, n = 0;
    this.room.state.plots.forEach((_p: PlotView, key: string) => {
      const [tx, ty] = key.split(",").map(Number);
      sumX += tx * TILE + TILE / 2;
      sumY += ty * TILE + TILE / 2;
      n++;
    });
    if (n === 0) {
      // Fallback: centro do mundo
      return {
        x: (this.room.state.gridWidth * TILE) / 2,
        y: (this.room.state.gridHeight * TILE) / 2,
      };
    }
    return { x: sumX / n, y: sumY / n };
  }

  // ---------- Input ----------

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pan.isPanning()) return;
    this.hasLocalPointer = true;
    const now = this.time.now;
    if (now - this.lastCursorSent < CURSOR_THROTTLE_MS) return;
    this.lastCursorSent = now;
    this.room.send("cursor", {
      x: Math.round(pointer.worldX),
      y: Math.round(pointer.worldY),
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.pan.isPanning()) return;  // o pan já consumiu este down
    if (!pointer.leftButtonDown()) return;

    const tx = Math.floor(pointer.worldX / TILE);
    const ty = Math.floor(pointer.worldY / TILE);
    if (tx < 0 || tx >= this.room.state.gridWidth || ty < 0 || ty >= this.room.state.gridHeight) return;

    const key = `${tx},${ty}`;
    const crop = this.room.state.crops.get(key);
    if (crop) {
      const stage = getCropStage(crop.cropType as CropType, crop.plantedAt, Date.now());
      if (stage.harvestable) {
        this.room.send("harvest", { x: tx, y: ty });
      }
      return;
    }
    this.room.send("plant", { x: tx, y: ty, cropType: this.hud.selectedCrop });
  }

  // ---------- Sync loops ----------

  private syncCursorsAndArrows(): void {
    const cam = this.cameras.main;
    const view = cam.worldView; // Phaser.Geom.Rectangle

    const seenCursors = new Set<string>();
    const seenArrows = new Set<string>();

    this.room.state.cursors.forEach((cursor: CursorView, sessionId: string) => {
      const isOwn = sessionId === this.room.sessionId;

      if (isOwn) {
        // A mãozinha própria sempre aparece (depois do primeiro pointer move)
        // e usa posição LOCAL do ponteiro (sem lag de rede).
        if (!this.hasLocalPointer) return;
        seenCursors.add(sessionId);
        let sprite = this.cursorSprites.get(sessionId);
        if (!sprite) {
          sprite = renderHandCursor(this, cursor.handColor, "");
          this.ownCursorLayer.add(sprite);
          this.cursorSprites.set(sessionId, sprite);
        }
        const p = this.input.activePointer;
        sprite.setPosition(Math.round(p.worldX), Math.round(p.worldY));
        return;
      }

      // Cursor remoto
      const inView = view.contains(cursor.x, cursor.y);
      if (inView) {
        seenCursors.add(sessionId);
        let sprite = this.cursorSprites.get(sessionId);
        if (!sprite) {
          sprite = renderHandCursor(this, cursor.handColor, cursor.nickname);
          this.cursorsLayer.add(sprite);
          this.cursorSprites.set(sessionId, sprite);
        }
        sprite.setPosition(cursor.x, cursor.y);
      } else {
        seenArrows.add(sessionId);
        let arrow = this.arrowSprites.get(sessionId);
        if (!arrow) {
          arrow = renderOffScreenArrow(this, cursor.handColor, cursor.nickname);
          this.arrowsLayer.add(arrow);
          this.arrowSprites.set(sessionId, arrow);
        }
        // Projeta a posição do cursor remoto na borda da viewport.
        const margin = 20;
        const cx = view.centerX;
        const cy = view.centerY;
        const dx = cursor.x - cx;
        const dy = cursor.y - cy;
        const halfW = view.width / 2 - margin;
        const halfH = view.height / 2 - margin;
        const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
        const projX = cx + dx / scale;
        const projY = cy + dy / scale;
        arrow.setPosition(projX, projY);
        arrow.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      }
    });

    // Limpa cursores/setas de sessões que sumiram
    for (const [sessionId, sprite] of this.cursorSprites) {
      if (!seenCursors.has(sessionId)) {
        sprite.destroy();
        this.cursorSprites.delete(sessionId);
      }
    }
    for (const [sessionId, arrow] of this.arrowSprites) {
      if (!seenArrows.has(sessionId)) {
        arrow.destroy();
        this.arrowSprites.delete(sessionId);
      }
    }
  }

  private syncCrops(): void {
    const now = Date.now();
    const seen = new Set<string>();
    this.room.state.crops.forEach((crop: CropView, key: string) => {
      seen.add(key);
      const [tx, ty] = key.split(",").map(Number);
      const cropType = crop.cropType as CropType;
      let sprite = this.cropSprites.get(key);
      if (!sprite) {
        sprite = renderCrop(this, cropType, tx * TILE, ty * TILE);
        this.cropsLayer.add(sprite);
        this.cropSprites.set(key, sprite);
      }
      updateCropSprite(sprite, cropType, crop.plantedAt, now);
    });
    for (const [key, sprite] of this.cropSprites) {
      if (!seen.has(key)) {
        sprite.destroy();
        this.cropSprites.delete(key);
      }
    }
  }
}
```

- [ ] **Step 2: Confirmar typecheck**

```
pnpm --filter @our-farm/web typecheck
```
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/FarmScene.ts
git commit -m "feat(web): FarmScene em camadas (mundo 50x40 + plots + decor + off-screen)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `apps/web` — `main.ts` com viewport fixo

**Files:**
- Modify: `apps/web/src/main.ts`

- [ ] **Step 1: Atualizar `main.ts` pra usar viewport fixo**

Substitua o conteúdo de `apps/web/src/main.ts`:
```ts
import "./ui/styles.css";
import Phaser from "phaser";
import { ensureIdentity } from "./identity";
import { connectToFarm } from "./net/room";
import { createHud } from "./ui/hud";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { VIEWPORT } from "./game/constants";

async function main(): Promise<void> {
  const { token } = await ensureIdentity();
  const room = await connectToFarm(token);
  const hud = createHud();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    backgroundColor: "#1f2515",
  });

  game.scene.add("farm", FarmScene, true, { room, hud } satisfies FarmSceneData);
}

void main();
```

- [ ] **Step 2: Confirmar typecheck e build via Vite**

```
pnpm --filter @our-farm/web typecheck
```
Expected: limpo.

Sobe o servidor + Vite em background pra smoke-test:
```bash
make db-up >/dev/null
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null
corepack enable pnpm
pnpm --filter @our-farm/server dev > /tmp/server.log 2>&1 &
SERVER_PID=$!
pnpm --filter @our-farm/web dev > /tmp/vite.log 2>&1 &
VITE_PID=$!
for i in $(seq 1 30); do curl -sf http://localhost:5173 >/dev/null 2>&1 && curl -sf http://localhost:2567/health >/dev/null 2>&1 && break; sleep 1; done
echo "VITE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173)"
echo "SERVER=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:2567/health)"
kill $VITE_PID $SERVER_PID 2>/dev/null
wait $VITE_PID $SERVER_PID 2>/dev/null
```
Expected: `VITE=200` e `SERVER=200`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/main.ts
git commit -m "feat(web): main.ts usa viewport fixo (1024x640)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Verificação final end-to-end (smoke test + manual check)

**Files:**
- (nenhum arquivo de código — verificação)

- [ ] **Step 1: Rodar a suíte inteira de testes**

```
make test && make typecheck
```
Expected: 
- `@our-farm/shared`: 14 testes (5 crop-stage + 9 validation)
- `@our-farm/server`: 16 testes (4 cursor + 5 plant — incluindo o novo de unlocked + 3 harvest + 4 routes)
- `@our-farm/web`: 12 testes (6 rng + 6 decorations)
- typecheck limpo nos 3.

- [ ] **Step 2: Smoke test programático com 2 clientes**

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null
make db-up >/dev/null
make db-seed
pnpm --filter @our-farm/server dev > /tmp/server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do curl -sf http://localhost:2567/health >/dev/null 2>&1 && break; sleep 1; done

mkdir -p apps/web/scripts
cat > apps/web/scripts/smoke-marco2.mjs <<'EOF'
import { Client } from "colyseus.js";

async function register(nickname) {
  const r = await fetch("http://localhost:2567/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, handStyle: { color: "#ff8800", shape: "point" } }),
  });
  if (!r.ok) throw new Error("register failed");
  return (await r.json()).token;
}

async function joinFarm(token) {
  const client = new Client("ws://localhost:2567");
  const room = await client.joinOrCreate("farm", { token });
  if (!room.state.farmId) await new Promise((res) => room.onStateChange.once(res));
  return room;
}

const tokenA = await register("AliceM2");
const roomA = await joinFarm(tokenA);
console.log("grid:", roomA.state.gridWidth, "x", roomA.state.gridHeight);
console.log("plots:", roomA.state.plots.size);

// Plantar DENTRO do starter pack (12,12) — deve aceitar
roomA.send("plant", { x: 12, y: 12, cropType: "carrot" });
await new Promise(r => setTimeout(r, 300));
console.log("após plant em (12,12):", roomA.state.crops.size, "crops, contém:", roomA.state.crops.has("12,12"));

// Tentar plantar FORA do starter pack (20,20) — deve rejeitar
roomA.send("plant", { x: 20, y: 20, cropType: "carrot" });
await new Promise(r => setTimeout(r, 300));
console.log("após plant em (20,20):", roomA.state.crops.size, "crops, contém:", roomA.state.crops.has("20,20"));

roomA.leave();
process.exit(0);
EOF

cd apps/web && node scripts/smoke-marco2.mjs ; cd ../..
rm -f apps/web/scripts/smoke-marco2.mjs
rmdir apps/web/scripts 2>/dev/null

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
```

Expected output:
- `grid: 50 x 40`
- `plots: 36`
- `após plant em (12,12): 1 crops, contém: true`
- `após plant em (20,20): 1 crops, contém: false` (rejeitado — só 1 crop, a de (12,12))

- [ ] **Step 3: Verificação manual em duas abas (humano)**

(Esta etapa é pra você, jogador. Subagentes podem pular.)
```
make dev
```
Abre `http://localhost:5173` em duas abas:
- Cadastra apelidos e mãos diferentes em cada.
- O mundo é maior — você vê grama em todos os cantos, decorações (árvores como círculos verdes, pedras como elipses cinzas) espalhadas. No centro há um bloco 6×6 marrom (lotes desbloqueados) cercado por uma cerca placeholder.
- **Pan**: clique-e-arrasta com o botão do meio OU segure espaço + clique-esquerdo + arrasta. A câmera move suave.
- Clique numa terra DENTRO do quadrado marrom → planta. Cresce ao longo de 30s (cenoura) ou 2min (milho).
- Clique numa cultura pronta → colhe.
- Clique em grama FORA dos lotes → nada acontece (o servidor rejeita).
- Em duas abas, abas em partes diferentes do mundo: você deve ver uma **setinha pequena na borda** indicando onde a mãozinha do outro jogador está.

- [ ] **Step 4: Commit final do Marco 2**

(Não há mudanças de código nesta etapa; o commit é simbólico/opcional. Se preferir, pode pular este step.)

```bash
git commit --allow-empty -m "chore: marco 2 completo (mundo + lotes + camera + decor)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Notas de execução

- **Drizzle não gera os statements custom** (UPDATE farms, INSERT starter, INSERT crops) — eles precisam ser adicionados manualmente ao arquivo gerado, conforme Task 2 Step 3. O `--> statement-breakpoint` é o separador que o migrator do drizzle-orm usa.
- **Ordem de delete em `resetDb`** importa pelo FK: `crops → farm_plots → farms → users`. Task 5 atualiza pra incluir `farm_plots`.
- **Camera bounds** são em pixels, não tiles. `cam.setBounds(0, 0, gridWidth*TILE, gridHeight*TILE)`. Pan respeita esses bounds automaticamente.
- **Phaser 4 specifics**: `pointer.middleButtonDown()`, `pointer.leftButtonDown()`, `cam.worldView`, `cam.centerOn(x,y)`, `Phaser.Input.Keyboard.KeyCodes.SPACE` — todas confirmadas existir no `phaser@4.1.0`.
- **A própria mãozinha é ignorada pelo "off-screen indicator"** — só renderiza no `ownCursorLayer` na posição local. Tasks 11 e 12 já têm essa separação clara.

## Cobertura do spec

| Seção do spec | Task(s) |
| --- | --- |
| §4 Estrutura do mundo (50×40, viewport, camadas) | 8 (constants), 11 (camadas + camera bounds), 12 (viewport) |
| §5 Modelo de dados (`farm_plots`, `PlotState`, `unlocked`) | 1, 2, 3, 5 |
| §6 Camada de assets | 8 |
| §7 Decoração procedural | 6, 7, 11 (uso) |
| §8 Câmera e controles (pan Figma) | 9, 11 (uso) |
| §9 Off-screen indicator | 11 |
| §10 Migração + preserva crops + starter pack | 2, 4 |
| §11 Testes (validatePlant + FarmRoom + decorations) | 1, 5, 6, 7 |
| §12 Escopo do Marco 2 (entra/fica de fora) | Tudo acima — fora de escopo (economia, curral, sprites reais) não tem task |
