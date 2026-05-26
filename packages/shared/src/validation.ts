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
