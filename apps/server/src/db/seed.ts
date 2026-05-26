import "../env";
import { db, queryClient } from "./client";
import { getSharedFarm, insertPlot } from "./repository";
import { farms } from "./schema";
import { STARTER_OFFSET, STARTER_SIZE } from "./starter-pack";

try {
  let farm = await getSharedFarm();
  if (farm) {
    console.log("Fazenda compartilhada já existe.");
  } else {
    await db.insert(farms).values({
      name: "Fazenda Compartilhada",
      ownerId: null,
      type: "shared",
      gridWidth: 50,
      gridHeight: 40,
    });
    console.log("Fazenda compartilhada criada.");
    farm = await getSharedFarm();
  }
  if (!farm) throw new Error("shared farm missing after create");

  let unlockedCount = 0;
  for (let dy = 0; dy < STARTER_SIZE; dy++) {
    for (let dx = 0; dx < STARTER_SIZE; dx++) {
      await insertPlot({
        farmId: farm.id,
        x: STARTER_OFFSET + dx,
        y: STARTER_OFFSET + dy,
      });
      unlockedCount++;
    }
  }
  console.log(`Starter pack garantido (${unlockedCount} lotes em ${STARTER_OFFSET}..${STARTER_OFFSET + STARTER_SIZE - 1}, ambos eixos).`);
} finally {
  await queryClient.end();
}
