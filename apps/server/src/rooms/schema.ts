import { Schema, MapSchema, type } from "@colyseus/schema";

export class Cursor extends Schema {
  @type("string") userId = "";
  @type("string") nickname = "";
  @type("string") handColor = "#ffcc00";
  @type("string") handShape = "point";
  @type("number") x = 0;
  @type("number") y = 0;
}

export class CropState extends Schema {
  @type("string") cropType = "";
  @type("number") plantedAt = 0;
  @type("string") plantedBy = "";
}

export class PlotState extends Schema {
  @type("number") unlockedAt = 0;
}

export class FarmState extends Schema {
  @type("string") farmId = "";
  @type("number") gridWidth = 16;
  @type("number") gridHeight = 16;
  @type({ map: Cursor }) cursors = new MapSchema<Cursor>();
  @type({ map: CropState }) crops = new MapSchema<CropState>();
  @type({ map: PlotState }) plots = new MapSchema<PlotState>();
}

/** Chave usada nos MapSchema `crops` e `plots`. */
export const tileKey = (x: number, y: number): string => `${x},${y}`;
