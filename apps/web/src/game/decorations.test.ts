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
      density: 1,
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

  it("é estável quando o conjunto de unlocked muda (decorações fora não se mexem)", () => {
    const allOpen = generateDecorations({ farmId: FARM_ID, ...GRID, unlockedTiles: new Set() });
    const withUnlocked = generateDecorations({
      farmId: FARM_ID,
      ...GRID,
      unlockedTiles: new Set(["10,10", "10,11"]),
    });
    // Toda decoração que existe em ambos os runs (i.e., em tile não-unlocked
    // no segundo run) deve estar na mesma posição que no primeiro run.
    for (const d of withUnlocked) {
      const matching = allOpen.find((a) => a.x === d.x && a.y === d.y);
      expect(matching).toBeDefined();
      expect(matching?.kind).toBe(d.kind);
    }
  });
});
