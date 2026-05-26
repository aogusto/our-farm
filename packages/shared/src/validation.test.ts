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
    expect(validatePlant({ x: 0, y: 16, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: 0, y: -1, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
  });

  it("rejeita coordenadas não-inteiras", () => {
    expect(validatePlant({ x: 1.5, y: 0, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
    expect(validatePlant({ x: 0, y: 1.5, cropType: "carrot", occupied: false, ...GRID }).ok).toBe(false);
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
