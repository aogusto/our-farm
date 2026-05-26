import { db } from "../db/client";
import { crops, farms, users } from "../db/schema";
import { createUser } from "../db/repository";
import type { Farm, HandStyle, User } from "@our-farm/shared";

/** Limpa as três tabelas — chamado antes de cada teste. */
export async function resetDb(): Promise<void> {
  await db.delete(crops);
  await db.delete(farms);
  await db.delete(users);
}

/** Cria uma fazenda compartilhada de teste. */
export async function seedSharedFarm(): Promise<Farm> {
  const [row] = await db.insert(farms).values({
    name: "Fazenda de Teste",
    ownerId: null,
    type: "shared",
    gridWidth: 16,
    gridHeight: 16,
  }).returning();
  if (!row) throw new Error("seedSharedFarm: insert returned no row");
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    type: "shared",
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
  };
}

export async function makeUser(nickname = "Tester"): Promise<User> {
  const handStyle: HandStyle = { color: "#ff8800", shape: "point" };
  return createUser({ nickname, handStyle });
}
