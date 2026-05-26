# Our Farm — Spec do Mundo e Campo (Marco 2)

**Data:** 2026-05-26
**Status:** Aprovado para planejamento
**Escopo:** Pivot visual + estrutural do playfield: mundo grande com câmera, conjunto de
lotes desbloqueáveis, camada de assets abstrata pra arte placeholder hoje / sprites
reais depois.

---

## 1. Contexto e objetivo

Marco 1 entregou um grid plano 16×16 com plant/grow/harvest funcionando ao vivo entre
clientes. Visualmente é uma prova de conceito: retângulos coloridos sobre fundo verde,
sem cenário ao redor, sem nenhuma noção de "fazenda como lugar".

O objetivo do Marco 2 é dar **forma de jogo de fazenda** à coisa, sem ainda atacar
economia/animais (que viram specs próprios):

- Um **mundo maior** (50×40 tiles) com decoração ao redor do campo plantável.
- O campo plantável vira um **conjunto de lotes desbloqueáveis** (pequeno no início,
  expansível depois quando a economia chegar).
- **Câmera com pan** estilo Figma pra navegar o mundo.
- Uma **camada de assets abstrata** que hoje desenha formas coloridas e amanhã, com a
  troca dos factories, vira `add.image(sprite-path)` sem mexer no resto do código.

Tudo da mecânica de Marco 1 (presença ao vivo, plant/harvest, persistência, server
authority) é preservado. O servidor segue cego pra câmera: coordenadas são sempre
globais.

## 2. Decisões tomadas no brainstorming

| Tema | Decisão |
| --- | --- |
| Perspectiva | Top-down 3/4 (estilo Stardew Valley) — tiles ainda retangulares no grid, a "profundidade" vem da arte. Não é isométrico verdadeiro com projeção diamante. |
| Tamanho do mundo | "C" — Grande (~50×40 tiles, 2000×1600 px), com scroll/pan |
| Área plantável | Conjunto de lotes desbloqueados (não retângulo fixo). Pequeno no início, expansível depois. |
| Câmera | Pan tipo Figma: botão do meio ou **espaço + arrasta**. Sem zoom, sem scroll por roda. |
| Fonte da arte | Placeholders (retângulos/formas coloridas), com camada de abstração pra troca por sprites reais (itch.io ou custom) depois. |
| Economia / compra de lotes | **Fora deste spec**. Só o modelo de dados fica pronto. |
| Curral / animais | **Fora deste spec**. Próximo Marco. |

## 3. Stack

Sem novas dependências. Toda a mudança usa o que já está instalado:

- `colyseus@0.16` + `@colyseus/schema@3` (server + client)
- `phaser@4` (web)
- `drizzle-orm@0.45` + `postgres` (DB)
- Vitest + `@colyseus/testing` (testes)

## 4. Estrutura do mundo

```text
World canvas (Phaser game): 1024×640 px (viewport fixo)
World bounds (camera):       2000×1600 px (50×40 tiles × 40 px)
```

Camera do Phaser tem `setBounds(0, 0, 2000, 1600)` e a `scrollX/scrollY` se movimenta
dentro disso por pan. A viewport não precisa ser pixel-perfeita com a resolução do
usuário — Phaser escala via `Phaser.Scale.FIT` ou similar (configurado no
`Phaser.Game.scale`).

### Camadas de render (de baixo pra cima)

1. **Background grass** — tile de grama em todas as 50×40 posições.
2. **Decorations** — árvores, pedras, etc., procedurais com seed `farmId` (ver §7).
3. **Fence** — cerca delimitando o conjunto atual de lotes desbloqueados.
4. **Dirt plots** — tile marrom em cada lote desbloqueado (sobre a grama).
5. **Crops** — culturas plantadas, com o sprite/forma do estágio atual.
6. **Other cursors** — mãozinhas dos outros jogadores que estão dentro da viewport.
7. **Off-screen arrows** — setinhas na borda apontando pros jogadores fora da viewport.
8. **Own cursor** — sua mãozinha (já implementada em Marco 1, segue acima de tudo).
9. **UI overlay** (HTML, fora do canvas) — HUD seletor de cultura, painel de status.

Cada camada é um `Phaser.GameObjects.Container` ou um grupo nominal — facilita
ordenação z e operações coletivas (mostrar/esconder uma camada inteira).

## 5. Modelo de dados

### Tabela nova: `farm_plots`

```sql
CREATE TABLE farm_plots (
  farm_id      uuid NOT NULL REFERENCES farms(id),
  x            integer NOT NULL,
  y            integer NOT NULL,
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, x, y)
);
```

Cada linha representa um tile que pode ser plantado. Sem linha = lote travado.
`unlocked_at` registra quando foi desbloqueado (útil pra analytics e economia depois).

### Mudança em `farms`

`grid_width` e `grid_height` aumentam de 16×16 → 50×40. Mudança via migração Drizzle
(`UPDATE farms SET grid_width=50, grid_height=40 WHERE ...`); o schema não muda em
si.

### Estado da Room (Colyseus Schema)

```text
FarmState
├── farmId
├── gridWidth, gridHeight     (agora 50×40)
├── cursors: Map<sessionId, Cursor>   (igual Marco 1)
├── crops:   Map<"x,y", CropState>    (igual Marco 1)
└── plots:   Map<"x,y", PlotState>    (NOVO)

PlotState extends Schema
└── @type("number") unlockedAt = 0
```

`tileKey(x, y)` continua sendo `"${x},${y}"` (mesma chave usada em `crops`).

### Repositório (`apps/server/src/db/repository.ts`)

Funções novas:

```ts
getFarmPlots(farmId: string): Promise<Plot[]>
insertPlot({ farmId, x, y, unlockedAt? }): Promise<Plot>
```

Onde `Plot = { farmId, x, y, unlockedAt }` (em `@our-farm/shared`).

### Validação atualizada

`PlantInput` em `@our-farm/shared` ganha um campo:

```ts
export interface PlantInput {
  x: number;
  y: number;
  cropType: string;
  occupied: boolean;
  unlocked: boolean;        // NOVO
  gridWidth: number;
  gridHeight: number;
}
```

`validatePlant` rejeita com `reason: "lote não desbloqueado"` quando `unlocked === false`.
A ordem de rejeição passa a ser: inteiros → dentro do grid → desbloqueado → não-ocupado
→ tipo de cultura conhecido.

`FarmRoom.handlePlant` agora passa `unlocked: this.state.plots.has(tileKey(x, y))`.

## 6. Camada de assets

`apps/web/src/game/assets.ts` (arquivo novo). Define os tipos de coisa que o cliente
desenha e o factory de cada um:

```ts
import Phaser from "phaser";
import { TILE } from "./constants";
import type { CropType } from "@our-farm/shared";

export type TileKind =
  | "grass" | "dirt-plot"
  | "fence-h" | "fence-v" | "fence-corner-tl" | "fence-corner-tr"
  | "fence-corner-bl" | "fence-corner-br"
  | "tree" | "rock"
  | "off-screen-arrow";

export interface TileRenderer {
  (scene: Phaser.Scene, x: number, y: number, color?: number): Phaser.GameObjects.GameObject;
}

export const TILE_RENDERERS: Record<TileKind, TileRenderer> = {
  grass: (s, x, y) => s.add.rectangle(x, y, TILE, TILE, 0x5a8a35).setOrigin(0),
  "dirt-plot": (s, x, y) =>
    s.add.rectangle(x, y, TILE, TILE, 0x8d6e4a).setOrigin(0).setStrokeStyle(1, 0x6b5234),
  "fence-h": (s, x, y) =>
    s.add.rectangle(x, y + TILE - 6, TILE, 6, 0x6e4f2a).setOrigin(0),
  "fence-v": (s, x, y) =>
    s.add.rectangle(x + TILE - 6, y, 6, TILE, 0x6e4f2a).setOrigin(0),
  // cantos: cerca em forma de "L"
  // ... análogos
  tree: (s, x, y) =>
    s.add.circle(x + TILE / 2, y + TILE / 2, TILE * 0.4, 0x2f5a20).setStrokeStyle(2, 0x1a3010),
  rock: (s, x, y) =>
    s.add.ellipse(x + TILE / 2, y + TILE / 2, TILE * 0.5, TILE * 0.35, 0x707070),
  "off-screen-arrow": (s, x, y, color) =>
    s.add.triangle(x, y, 0, 0, 0, 12, 16, 6, color ?? 0xffffff),
};

export function renderTile(
  scene: Phaser.Scene,
  kind: TileKind,
  x: number,
  y: number,
  color?: number,
): Phaser.GameObjects.GameObject {
  return TILE_RENDERERS[kind](scene, x, y, color);
}

// Render de cultura por estágio (4 estágios × 2 tipos)
export interface CropRenderer {
  (scene: Phaser.Scene, x: number, y: number, stage: number, harvestable: boolean):
    Phaser.GameObjects.GameObject;
}

export const CROP_RENDERERS: Record<CropType, CropRenderer> = {
  carrot: /* círculo laranja crescendo, contorno branco quando harvestable */,
  corn:   /* círculo amarelo crescendo, contorno branco quando harvestable */,
};
```

Quando os sprites reais (`tree.png`, `grass.png`, etc.) entrarem em `apps/web/public/assets/`,
o corpo de cada factory vira `scene.add.image(x, y, "tree").setOrigin(0)` (com pré-load
configurado num `BootScene` ou no `preload()` da FarmScene). Nenhum outro código muda.

## 7. Cenário e decoração procedural

Decorações (árvores, pedras) NÃO ficam no estado da Room. São puramente visuais e
**procedurais a partir de um seed determinístico (`farmId`)**, então todos os clientes
na mesma fazenda computam as mesmas posições e veem o mesmo cenário sem trocar bytes
extras.

Algoritmo (em `apps/web/src/game/decorations.ts`):

```ts
import { mulberry32 } from "./rng";          // pequeno PRNG seedável

export interface Decoration {
  kind: "tree" | "rock";
  x: number;  // tile coord
  y: number;
}

export function generateDecorations(
  farmId: string,
  gridWidth: number,
  gridHeight: number,
  unlockedTiles: Set<string>,
  density: number = 0.06,
): Decoration[] {
  const seed = hashString(farmId);
  const rng = mulberry32(seed);
  const out: Decoration[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (unlockedTiles.has(`${x},${y}`)) continue;   // nada de árvore em cima de lote
      if (rng() > density) continue;
      out.push({ kind: rng() < 0.7 ? "tree" : "rock", x, y });
    }
  }
  return out;
}
```

`mulberry32` é um PRNG de 4 linhas, suficiente pra distribuição uniforme cosmética.
`hashString` converte o `farmId` (UUID) num seed numérico de 32 bits.

A FarmScene chama isso uma vez no `create()` e desenha as decorações. Quando o conjunto
de lotes desbloqueados muda (no futuro, na compra de lotes), basta regenerar — barato.

## 8. Câmera e controles

### Inicialização

```ts
const cam = this.cameras.main;
cam.setBounds(0, 0, gridWidth * TILE, gridHeight * TILE);
// Centraliza no meio do conjunto de lotes inicial
const center = computePlotCenter(plots);
cam.centerOn(center.x * TILE, center.y * TILE);
```

### Pan estilo Figma

`apps/web/src/game/camera.ts` (módulo novo) expõe `setupCameraPan(scene)`:

- **Botão do meio** ou **espaço segurado + botão esquerdo** ativa o modo pan.
- Em `POINTER_DOWN` com a condição certa: salva `dragStart = { x, y, scrollX, scrollY }`,
  marca `isPanning = true`, troca o cursor CSS pra `grabbing`.
- Em `POINTER_MOVE` enquanto `isPanning`: atualiza `cam.scrollX/Y` com base no delta entre
  `pointer.x/y` atual e `dragStart`. Phaser respeita os `bounds`.
- Em `POINTER_UP`: `isPanning = false`, cursor volta pra `none`.
- `keyDown("Space")` e `keyUp("Space")` mantêm a flag `spaceHeld`.

A flag `isPanning` é exposta pra `FarmScene` ignorar plant/harvest enquanto está em pan
(o pointer down que iniciou o pan não deve plantar nada).

### Coordenadas

Tudo na FarmScene continua usando `pointer.worldX/worldY`, que já leva em conta o scroll
da câmera. O servidor não enxerga câmera — todas as coordenadas no protocolo são globais
no mundo. **Zero mudança no protocolo cliente → servidor.**

### Posição inicial da própria mãozinha

Como Marco 1 só renderiza a própria mão após o primeiro `POINTER_MOVE` (flag
`hasLocalPointer`), e o jogador pode começar com pan/teclado antes de mover o mouse, isso
continua funcionando sem ajustes.

## 9. Multiplayer — mãozinhas fora da viewport

Cada cliente tem seu próprio `cam.scrollX/Y`. Um jogador que está pano-direita não enxerga
quem está pano-esquerda — a mão dele cai fora da viewport. Sem indicador, parece que ele
sumiu.

Solução: a cada frame, em `syncCursors`, pra cada cursor **remoto**:

1. Computa se o ponto `(cursor.x, cursor.y)` está dentro de `cam.worldView` (um `Rectangle`
   que Phaser expõe).
2. **Dentro**: desenha a mãozinha normalmente (igual Marco 1).
3. **Fora**: desenha em vez disso uma seta pequena **na borda da viewport** apontando pra
   ele. Posição da seta = projeção da posição do cursor remoto na borda mais próxima da
   viewport. Cor = `handColor` do cursor. Label = nickname (font menor pra não poluir).

Detalhe: como os sprites criados pra mãozinha e pra seta são diferentes, o reconciliador
vira "garante o sprite certo pra cada cursor" — se cursor estava dentro e saiu, destrói a
mãozinha e cria a seta; se voltou, vice-versa. Mantemos a estrutura `cursorSprites:
Map<sessionId, Container>` mas o conteúdo do container muda. Alternativa: dois containers
por cursor, mostra um, esconde outro. Mais simples — vamos com essa.

Clicar na seta pra centralizar a câmera no jogador remoto fica como **nice-to-have**
(fora do escopo do MVP).

## 10. Migração e estado existente

A fazenda compartilhada hoje tem `gridWidth=16, gridHeight=16` e provavelmente algumas
culturas plantadas em teste.

Migração nova (`drizzle/0001_marco2.sql`):

```sql
-- 1. Aumenta a fazenda compartilhada pro mundo maior.
UPDATE farms SET grid_width = 50, grid_height = 40 WHERE type = 'shared';

-- 2. Cria a tabela de lotes.
CREATE TABLE farm_plots (
  farm_id      uuid NOT NULL REFERENCES farms(id),
  x            integer NOT NULL,
  y            integer NOT NULL,
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, x, y)
);

-- 3. Desbloqueia o starter pack: bloco 6×6 nas coords (10..15, 10..15).
INSERT INTO farm_plots (farm_id, x, y)
SELECT f.id, gsx.x + 10, gsy.y + 10
FROM farms f
CROSS JOIN generate_series(0, 5) AS gsx(x)
CROSS JOIN generate_series(0, 5) AS gsy(y)
WHERE f.type = 'shared'
ON CONFLICT (farm_id, x, y) DO NOTHING;

-- 4. Preserva crops existentes: qualquer tile que já tem cultura plantada vira lote
--    desbloqueado também (auto-grant). ON CONFLICT garante idempotência com o starter.
INSERT INTO farm_plots (farm_id, x, y)
SELECT farm_id, x, y FROM crops
ON CONFLICT (farm_id, x, y) DO NOTHING;
```

(O Drizzle vai gerar essa migration via `db:generate`; o auto-grant das crops existentes
é um statement custom que precisaremos colocar à mão no arquivo gerado.)

O seed (`apps/server/src/db/seed.ts`) atualiza: além de criar a fazenda compartilhada se
não existir, também insere o starter pack de lotes (mesma lógica do step 3 da migration,
mas em código TS chamando `insertPlot` num loop, idempotente via `ON CONFLICT` no
repositório).

## 11. Estratégia de testes

### `packages/shared`

- `validatePlant` (TDD): adicionar test cases pro novo campo `unlocked`. Casos: rejeita
  quando `unlocked=false`, aceita quando `unlocked=true` e tudo mais válido. **Ordem** de
  rejeição (não-inteiro → fora do grid → não-desbloqueado → ocupado → cultura inválida)
  também testada via uma assertion sobre o `reason`.
- Decoration generation (`generateDecorations`): teste determinístico — mesma seed +
  mesma grid + mesmo unlocked-set produz o mesmo output (snapshot).

### `apps/server`

- `FarmRoom` (TDD): novos testes — "rejeita plantar em tile não desbloqueado" e "aceita
  plantar em tile desbloqueado" via `@colyseus/testing`. Cobertura de `state.plots`
  populado a partir do banco no `onCreate`.
- Repositório: `getFarmPlots` e `insertPlot` cobertos indiretamente pelos testes da Room.

### `apps/web`

- Como Marco 1, sem unit tests de Phaser/DOM. Smoke test manual: abrir duas abas, pan,
  ver mãozinhas fora da viewport como seta, plantar dentro do starter pack, tentar
  plantar fora (deve falhar silenciosamente — o servidor recusa).

## 12. Escopo do Marco 2

### Entra

- Mundo 50×40 (migration + state expandido)
- Tabela `farm_plots` + repositório + state da Room (`plots`)
- Validação `validatePlant` com `unlocked` (TDD)
- Camada de assets abstrata (`assets.ts`) com factories placeholder pra grass, dirt-plot,
  fence (4 cantos + 2 orientações), tree, rock, off-screen-arrow, e renders por estágio
  pras 2 culturas existentes
- Decoração procedural seedada por `farmId`
- Camera Phaser com pan middle-drag e space+drag, sem zoom
- Indicador de jogadores fora da viewport (seta na borda + cor + nickname)
- Migration que preserva crops existentes auto-desbloqueando seus tiles
- Seed atualizado pra criar starter pack de 6×6

### Fica de fora (specs futuros)

- Economia, moedas, botão de comprar lote (próximo natural)
- Curral + sistema de animais
- Sprites reais (troca dos factories, não exige código novo)
- Zoom da câmera
- Click na seta off-screen pra centralizar no jogador remoto
- Touch / mobile / responsivo
- Som
- Placement livre de decorações pelo jogador
- Múltiplas fazendas / fazenda pessoal
- Auth real

## 13. Riscos e questões em aberto

- **Performance**: 50×40 = 2000 tiles de grama renderizadas como `rectangle` cada. Phaser
  aguenta bem (são draw calls baratos), mas se ficar pesado, mitiga com um único
  `tilemap` ou `TileSprite` cobrindo o fundo. Optimização tardia; só se medir.
- **Decoração sobre lotes recém-desbloqueados**: se um jogador desbloqueia um lote no
  futuro e ali já tinha uma "árvore" procedural, a decoração some (filtro
  `unlockedTiles.has(...)`). Regenerar decorações nessa hora é OK porque é client-side.
- **Concorrência em unlocks**: irrelevante neste spec (não há flow de unlock ainda); fica
  pra economia.
- **Conflito de starter pack se a fazenda já existe**: migration usa `INSERT ... ON
  CONFLICT DO NOTHING` (implicitamente, na ordem 3 → 4) — idempotente. Rodar a migration
  duas vezes não duplica nada.
- **Visual placeholder vai parecer pobre**: previsto. A camada de abstração existe pra
  ser bonito o suficiente até a arte chegar, sem prometer mais do que retângulos.
