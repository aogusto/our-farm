import { db } from "../db/client";
import { crops, farms, users, farmPlots } from "../db/schema";
import { createUser, insertPlot } from "../db/repository";
import { STARTER_OFFSET, STARTER_SIZE } from "../db/starter-pack";
import type { Farm, HandStyle, User } from "@our-farm/shared";

/** Limpa as quatro tabelas — chamado antes de cada teste. */
export async function resetDb(): Promise<void> {
  await db.delete(crops);
  await db.delete(farmPlots);
  await db.delete(farms);
  await db.delete(users);
}

/** Cria uma fazenda compartilhada de teste e desbloqueia o starter pack 6×6. */
export async function seedSharedFarm(): Promise<Farm> {
  const [row] = await db.insert(farms).values({
    name: "Fazenda de Teste",
    ownerId: null,
    type: "shared",
    gridWidth: 50,
    gridHeight: 40,
  }).returning();
  if (!row) throw new Error("seedSharedFarm: insert returned no row");
  const farm: Farm = {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    type: "shared",
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
  };
  for (let dy = 0; dy < STARTER_SIZE; dy++) {
    for (let dx = 0; dx < STARTER_SIZE; dx++) {
      await insertPlot({ farmId: farm.id, x: STARTER_OFFSET + dx, y: STARTER_OFFSET + dy });
    }
  }
  return farm;
}

export async function makeUser(nickname = "Tester"): Promise<User> {
  const handStyle: HandStyle = { color: "#ff8800", shape: "point" };
  return createUser({ nickname, handStyle });
}
