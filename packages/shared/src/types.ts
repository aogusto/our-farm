export type HandShape = "point" | "open" | "pinch";

export interface HandStyle {
  color: string; // hex "#RRGGBB"
  shape: HandShape;
}

export interface User {
  id: string;
  nickname: string;
  handStyle: HandStyle;
  token: string;
  createdAt: string; // ISO
}

export type FarmType = "shared" | "personal";

export interface Farm {
  id: string;
  name: string;
  ownerId: string | null;
  type: FarmType;
  gridWidth: number;
  gridHeight: number;
}

export type CropType = "carrot" | "corn";

export interface Crop {
  id: string;
  farmId: string;
  x: number;
  y: number;
  cropType: CropType;
  plantedAt: number; // epoch ms
  plantedBy: string;
}

/** Payloads de mensagem cliente → servidor. */
export interface CursorMessage { x: number; y: number; }
export interface PlantMessage { x: number; y: number; cropType: CropType; }
export interface HarvestMessage { x: number; y: number; }
