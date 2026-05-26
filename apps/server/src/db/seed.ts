import "../env";
import { db, queryClient } from "./client";
import { getSharedFarm } from "./repository";
import { farms } from "./schema";

const existing = await getSharedFarm();
if (existing) {
  console.log("Fazenda compartilhada já existe — nada a fazer.");
} else {
  await db.insert(farms).values({
    name: "Fazenda Compartilhada",
    ownerId: null,
    type: "shared",
    gridWidth: 16,
    gridHeight: 16,
  });
  console.log("Fazenda compartilhada criada.");
}
await queryClient.end();
