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
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CROP_CATALOG, value);
}
