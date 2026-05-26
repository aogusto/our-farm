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
      // Consumimos UM número do RNG por tile, mesmo nos tiles desbloqueados ou
      // sem decoração, pra que o output seja estável quando o conjunto de
      // unlocked tiles mudar (ex: jogador desbloqueando um lote novo).
      const roll = rng();
      if (input.unlockedTiles.has(`${x},${y}`)) continue;
      if (roll >= density) continue;
      const kindRoll = rng();
      out.push({ kind: kindRoll < 0.7 ? "tree" : "rock", x, y });
    }
  }
  return out;
}
