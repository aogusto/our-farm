import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { users, farms, crops, farmPlots } from "./schema";
import { normalizeHandStyle } from "@our-farm/shared";
import type { Crop, CropType, Farm, HandStyle, Plot, User } from "@our-farm/shared";

function rowToUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    nickname: row.nickname,
    handStyle: normalizeHandStyle(row.handStyle),
    token: row.token,
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToFarm(row: typeof farms.$inferSelect): Farm {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    type: row.type as Farm["type"],
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
  };
}

function rowToCrop(row: typeof crops.$inferSelect): Crop {
  return {
    id: row.id,
    farmId: row.farmId,
    x: row.x,
    y: row.y,
    cropType: row.cropType as CropType,
    plantedAt: row.plantedAt.getTime(),
    plantedBy: row.plantedBy,
  };
}

export async function createUser(input: { nickname: string; handStyle: HandStyle }): Promise<User> {
  const [row] = await db.insert(users).values({
    nickname: input.nickname,
    handStyle: input.handStyle,
    token: randomUUID(),
  }).returning();
  if (!row) throw new Error("createUser: insert returned no row");
  return rowToUser(row);
}

export async function getUserByToken(token: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.token, token));
  return row ? rowToUser(row) : null;
}

export async function getSharedFarm(): Promise<Farm | null> {
  const [row] = await db.select().from(farms).where(eq(farms.type, "shared"));
  return row ? rowToFarm(row) : null;
}

export async function getFarmCrops(farmId: string): Promise<Crop[]> {
  const rows = await db.select().from(crops).where(eq(crops.farmId, farmId));
  return rows.map(rowToCrop);
}

export async function insertCrop(input: {
  farmId: string;
  x: number;
  y: number;
  cropType: CropType;
  plantedBy: string;
  plantedAt?: number; // epoch ms; default = agora
}): Promise<Crop> {
  const [row] = await db.insert(crops).values({
    farmId: input.farmId,
    x: input.x,
    y: input.y,
    cropType: input.cropType,
    plantedBy: input.plantedBy,
    plantedAt: new Date(input.plantedAt ?? Date.now()),
  }).returning();
  if (!row) throw new Error("insertCrop: insert returned no row");
  return rowToCrop(row);
}

export async function deleteCropAt(farmId: string, x: number, y: number): Promise<boolean> {
  const deleted = await db.delete(crops)
    .where(and(eq(crops.farmId, farmId), eq(crops.x, x), eq(crops.y, y)))
    .returning({ id: crops.id });
  return deleted.length > 0;
}

function rowToPlot(row: typeof farmPlots.$inferSelect): Plot {
  return {
    farmId: row.farmId,
    x: row.x,
    y: row.y,
    unlockedAt: row.unlockedAt.getTime(),
  };
}

export async function getFarmPlots(farmId: string): Promise<Plot[]> {
  const rows = await db.select().from(farmPlots).where(eq(farmPlots.farmId, farmId));
  return rows.map(rowToPlot);
}

export async function insertPlot(input: {
  farmId: string;
  x: number;
  y: number;
  unlockedAt?: number;
}): Promise<Plot> {
  const inserted = await db.insert(farmPlots).values({
    farmId: input.farmId,
    x: input.x,
    y: input.y,
    unlockedAt: new Date(input.unlockedAt ?? Date.now()),
  }).onConflictDoNothing().returning();

  if (inserted.length > 0 && inserted[0]) {
    return rowToPlot(inserted[0]);
  }
  // Conflito (já existia): retorna a linha existente.
  const [existing] = await db.select().from(farmPlots).where(and(
    eq(farmPlots.farmId, input.farmId),
    eq(farmPlots.x, input.x),
    eq(farmPlots.y, input.y),
  ));
  if (!existing) throw new Error("insertPlot: insert returned no row and no existing row found");
  return rowToPlot(existing);
}
