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
