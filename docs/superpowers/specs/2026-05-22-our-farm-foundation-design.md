# Our Farm — Spec da Fundação (Marco 1)

**Data:** 2026-05-22
**Status:** Aprovado para planejamento
**Escopo:** Fundação do projeto + esqueleto jogável mínimo (Marco 1)

---

## 1. Contexto e objetivo

"Our Farm" é um jogo de fazenda web onde jogadores **compartilham a mesma fazenda**
em tempo real e, futuramente, podem ter fazendas próprias. A presença de cada
jogador é uma **mãozinha flutuante personalizável**, estilo cursores multiplayer
do Figma — não há avatar com física/pathfinding.

Este spec cobre apenas a **fundação**: o monorepo, a stack e o esqueleto jogável
mínimo que prova a arquitetura de ponta a ponta. Sistemas de jogo maiores
(economia, inventário, fazendas próprias) viram specs próprios depois.

**Objetivo do Marco 1:** dois navegadores entram na mesma fazenda compartilhada,
veem as mãozinhas um do outro ao vivo, plantam numa terra, a cultura cresce com o
tempo e pode ser colhida — tudo validado no servidor, persistido em banco e
sincronizado entre os jogadores.

## 2. Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Modelo multiplayer | Tempo real, sem avatar — mãozinha flutuante estilo Figma, personalizável por usuário |
| Escopo do MVP | Presença ao vivo + 1 loop de ação: plantar → crescer → colher |
| Identidade | Leve: apelido + mãozinha customizada → registro de `User` no banco + token. Sem senha/OAuth no MVP |
| Servidor real-time | Colyseus (MIT, self-hostado) — cada fazenda = uma Room |
| Hospedagem | Dev local agora; Railway no futuro (fora do escopo deste spec) |

## 3. Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Cliente (`apps/web`):** Vite + TypeScript + Phaser 3 + SDK cliente do Colyseus.
  Menus (apelido, customização da mão) em overlay HTML/CSS — sem React no MVP.
- **Servidor (`apps/server`):** Colyseus (rooms) + camada HTTP fina (registro de
  identidade) + Drizzle ORM sobre Postgres.
- **Compartilhado (`packages/shared`):** tipos do domínio + regras de jogo puras.
- **Banco:** Postgres (via Docker no dev local).
- **Runtime:** Node 20 LTS (instalado: v20.20.2).
- **Testes:** Vitest + `@colyseus/testing`.

## 4. Arquitetura e layout do monorepo

```
our-farm/
├── apps/
│   ├── web/         → cliente: Vite + TypeScript + Phaser 3 + cliente Colyseus
│   └── server/      → Colyseus (rooms) + HTTP (identidade) + acesso ao Postgres
├── packages/
│   └── shared/      → tipos do domínio + regras de jogo (puro, isomórfico, sem I/O)
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml   → Postgres pra dev local
├── .env.example
└── docs/
```

### Fronteiras dos módulos

Cada módulo tem um propósito único e uma interface bem definida:

- **`packages/shared`** — tipos (`User`, `Farm`, `Crop`, payloads de mensagem),
  catálogo de culturas e funções puras de regra/validação (ex.: `getCropStage`).
  Sem banco, sem dependências Node-only. Roda no browser e no servidor, então a
  regra de jogo **não duplica**.
- **`apps/server`** — dono do Postgres (schema + migrations Drizzle ficam aqui),
  das rooms Colyseus e das rotas HTTP. Valida toda ação e persiste antes de
  refletir no estado da Room.
- **`apps/web`** — Phaser desenha grid/culturas/mãozinhas; overlay HTML/CSS pros
  menus. Envia *intenções* (`plant`, `harvest`, `cursor`) ao servidor, nunca
  comandos diretos sobre o estado.

**Princípio:** regra de jogo no `shared`; servidor fino (validar + persistir +
sincronizar); cliente fino (renderizar + enviar intenção).

## 5. Modelo de dados (Postgres / Drizzle)

Três tabelas:

### `users`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `nickname` | text | |
| `hand_style` | jsonb | `{ color: string, style: string }` |
| `token` | text (único) | token opaco de sessão, guardado no localStorage do cliente |
| `created_at` | timestamptz | |

### `farms`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | |
| `owner_id` | uuid (FK→users), **nulável** | `null` para a fazenda compartilhada semeada |
| `type` | text | `shared` \| `personal` |
| `grid_width` | int | fixo por fazenda (MVP: 16) |
| `grid_height` | int | fixo por fazenda (MVP: 16) |

### `crops`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `farm_id` | uuid (FK→farms) | |
| `x` | int | coordenada de tile |
| `y` | int | coordenada de tile |
| `crop_type` | text | chave no catálogo de culturas |
| `planted_at` | timestamptz | fonte de verdade do crescimento |
| `planted_by` | uuid (FK→users) | |

Restrição de unicidade `(farm_id, x, y)` — no máximo uma cultura por tile.

**Tile vazio não vira linha** — só existe `crops` onde alguém plantou. Colher
**remove** a linha. Os campos `type`/`owner_id` em `farms` já existem para
fazendas próprias encaixarem no futuro, mas o MVP semeia **uma** fazenda
`type='shared'` com `owner_id` nulo.

## 6. Estado da Room e fluxo real-time

Cada fazenda = uma Room Colyseus, registrada sob o nome `farm`. No MVP a Room
carrega a única fazenda compartilhada semeada; futuramente as opções de `join`
carregam um `farmId`.

### Estado da Room (Colyseus Schema, sincroniza automaticamente)

```
FarmState
├── cursors: Map<sessionId, Cursor>
│     Cursor { userId, nickname, handColor, handShape, x, y }
└── crops:   Map<"x,y", Crop>
      Crop { cropType, plantedAt (epoch ms), plantedBy }
```

`handColor`/`handShape` no `Cursor` são os campos escalares `color`/`style` do
`hand_style` do `User`, achatados — campos de Schema do Colyseus são primitivos,
não objetos. `x,y` do cursor são coordenadas de mundo contínuas (a mão se move
suave, não snapa no grid). `x,y` das culturas são coordenadas de tile inteiras.

### Autenticação na Room

`onAuth` recebe o token nas opções de `join`, valida contra `users.token` e
carrega o `User`. Falha de token → join rejeitado.

### Ciclo de vida

- **`onCreate`** — carrega `farm` + `crops` do Postgres para `FarmState`.
- **`onJoin`** — cria um `Cursor` no estado a partir do `User` autenticado.
- **`onLeave`** — Colyseus remove o `Cursor` da sessão (presença automática).

### Mensagens cliente → servidor

| Mensagem | Payload | Tratamento no servidor |
|---|---|---|
| `cursor` | `{ x, y }` | Throttled no cliente (~20–30Hz). Servidor escreve direto no `Cursor` da sessão. |
| `plant` | `{ x, y, cropType }` | Valida → persiste → muta estado (ver §7). |
| `harvest` | `{ x, y }` | Valida → persiste → muta estado (ver §7). |

O diff do `FarmState` sincroniza para todos os clientes automaticamente; não há
código manual de broadcast.

## 7. Regras de jogo e validação

### Crescimento (derivado, sem game-loop)

O catálogo de culturas em `packages/shared` define, por cultura, a duração de
crescimento (`growthMs`) e os estágios visuais. O servidor guarda apenas
`planted_at`.

`getCropStage(plantedAt, now, cropType)` é uma função pura no `shared` que
retorna o estágio visual e `harvestable: boolean`. O **cliente** chama a cada
frame para desenhar o estágio certo; o **servidor** chama na validação de
colheita. Não há tick de servidor para crescimento — menos código, sem
dessincronização.

### Validação de `plant`

1. `x,y` dentro dos limites do grid da fazenda.
2. Não existe cultura em `(farm_id, x, y)`.
3. `cropType` existe no catálogo.

Sucesso → **insere** linha em `crops` com `planted_at = agora (servidor)` →
adiciona `Crop` ao `FarmState`.

### Validação de `harvest`

1. Existe cultura em `(farm_id, x, y)`.
2. `getCropStage(...).harvestable === true` usando o tempo do servidor.

Sucesso → **remove** a linha de `crops` → remove o `Crop` do `FarmState`.

### Ordem persistência → estado

Toda ação segue: **validar → persistir no Postgres → na confirmação, mutar o
`FarmState`**. O Postgres é a fonte de verdade; falha de escrita aborta a ação
sem sujar o estado da Room.

### Concorrência

A Room do Colyseus processa mensagens sequencialmente numa única thread. Dois
jogadores plantando no mesmo tile no mesmo instante são serializados
naturalmente: a segunda ação já enxerga a primeira aplicada e falha na
validação. A restrição de unicidade `(farm_id, x, y)` é a salvaguarda final.

## 8. Fluxo de identidade

Camada HTTP fina no `apps/server`:

| Rota | Entrada | Saída |
|---|---|---|
| `POST /api/register` | `{ nickname, handStyle }` | `{ userId, token }` |
| `GET /api/me` | header com token | `{ user }` |

**Primeira visita:** o overlay pede apelido e customização da mão (seletor de cor
+ poucos estilos preset) → `POST /api/register` → token guardado no
`localStorage`. **Visitas seguintes:** token → `GET /api/me` → entra direto. O
token também é passado nas opções de `join` da Room (ver §6).

`handStyle` é um JSON simples: `{ color: "#RRGGBB", style: <preset> }`.

## 9. Dev local

- `docker-compose.yml` sobe o Postgres; `.env` (a partir de `.env.example`)
  guarda a `DATABASE_URL`.
- `pnpm dev` (orquestrado pelo Turborepo) sobe `web` (Vite) e `server` (Colyseus
  com hot-reload via `tsx watch`) juntos.
- Scripts: `pnpm db:migrate` (Drizzle) e `pnpm db:seed` (cria a fazenda
  compartilhada padrão).
- Testar o real-time sozinho: abrir o jogo em duas abas do navegador.

## 10. Estratégia de testes

- **`packages/shared`** — funções puras (`getCropStage`, validações de plant/
  harvest) cobertas em TDD com Vitest. É onde mora a regra; é onde o teste rende.
- **`apps/server`** — lógica das rooms com `@colyseus/testing`: sobe uma room,
  injeta clientes e checa estado/persistência para `plant` e `harvest`,
  incluindo os caminhos de falha de validação.
- **`apps/web`** — leve. Canvas/Phaser não é testado unitariamente; a estratégia
  é manter o cliente fino e empurrar regra para o `shared`.

## 11. Escopo do Marco 1

### Entra

- Scaffold do monorepo (pnpm + Turborepo), Postgres no Docker, Node 20
- `packages/shared`: tipos, catálogo de culturas, `getCropStage` e validações
- Identidade leve: registrar apelido + customizar mãozinha → token
- Uma fazenda compartilhada semeada, grid fixo 16×16
- Room Colyseus: presença de cursores ao vivo + estado de culturas
- Phaser desenha grid + culturas (por estágio) + mãozinhas ao vivo
- Loop plantar → crescer (derivado) → colher: validado, persistido, sincronizado
- 2 tipos de cultura (uma rápida, uma lenta) para exercitar o catálogo
- Tooling do Claude Code: `CLAUDE.md` + `.claude/settings.json` (ver §13)

### Fica de fora (YAGNI — specs futuros)

- Fazenda própria / `type='personal'` (modelo de dados já suporta; falta UI/fluxo)
- Auth real (email/OAuth)
- Inventário, moedas, economia, dia/noite, som, arte caprichada
- Deploy no Railway
- Driver Redis de escala do Colyseus (um processo só basta no dev local)
- Agents customizados do Claude Code (criados em spec futuro, quando houver
  código e padrões reais para contextualizá-los)

## 12. Riscos e questões em aberto

- **Phaser é difícil de testar** — mitigado mantendo o cliente fino e a regra no
  `shared`. Aceito para o MVP.
- **Falha de persistência no meio de uma ação** — mitigada pela ordem
  validar → persistir → mutar estado (§7). Postgres é a fonte de verdade.
- **Valores de balanceamento** (durações de crescimento, tamanho do grid) são
  provisórios e ajustáveis; não bloqueiam a fundação.

## 13. Tooling do Claude Code (`.claude/`)

A fundação inclui o tooling do Claude Code, em versão enxuta — só o que rende
desde o dia 1.

### `CLAUDE.md` (raiz do repo)

Escrito como **última etapa do scaffold**, depois que a estrutura real existe —
assim documenta o que de fato está no disco, não uma estrutura imaginada.
Conteúdo:

- Visão geral do projeto e do layout do monorepo
- Comandos essenciais: `pnpm dev`, testes, `db:migrate`, `db:seed`, Docker
- Convenções de código: TypeScript `strict`; regra de jogo mora em
  `packages/shared`; servidor fino (valida + persiste + sincroniza); cliente
  fino (renderiza + envia intenção)
- Onde ficam schema/migrations (Drizzle em `apps/server`) e como rodá-las

### `.claude/settings.json`

Allowlist de permissões para os comandos recorrentes do projeto, evitando
prompts repetidos: `pnpm`, `turbo`, `docker compose`, `vitest`, `drizzle-kit`.
Sem hooks no Marco 1.

### Agents customizados — adiados

Decisão consciente: **nenhum agent customizado no Marco 1**. Um agent rende
quando encoda contexto específico e uma tarefa repetida; num projeto greenfield
ainda não há código nem padrões para isso. Arquitetar/implementar/testar/revisar
o primeiro build é coberto pelas skills do superpowers
(`writing-plans` → `executing-plans` → TDD → `requesting-code-review`). Agents
do projeto entram em spec futuro, quando os padrões reais existirem.
