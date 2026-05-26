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
