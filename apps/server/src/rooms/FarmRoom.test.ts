import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../app.config";
import { queryClient } from "../db/client";
import { resetDb, seedSharedFarm, makeUser } from "../test/db-helpers";
import { getFarmCrops, insertCrop } from "../db/repository";
import { CROP_CATALOG } from "@our-farm/shared";

describe("FarmRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); await resetDb(); });

  it("cria um cursor para o cliente que entrou", async () => {
    await seedSharedFarm();
    const user = await makeUser("Alice");
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    await room.waitForNextPatch();

    expect(room.state.cursors.size).toBe(1);
    expect(room.state.cursors.get(client.sessionId)?.nickname).toBe("Alice");
  });

  it("rejeita cliente com token inválido", async () => {
    await seedSharedFarm();
    const room = await colyseus.createRoom("farm", {});
    await expect(colyseus.connectTo(room, { token: "bogus" })).rejects.toBeDefined();
  });

  it("atualiza a posição do cursor na mensagem 'cursor'", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("cursor", { x: 120, y: 80 });
    await room.waitForNextPatch();

    expect(room.state.cursors.get(client.sessionId)?.x).toBe(120);
    expect(room.state.cursors.get(client.sessionId)?.y).toBe(80);
  });

  it("remove o cursor quando o cliente sai", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    await room.waitForNextPatch();
    await client.leave();
    // After the last client leaves there are no recipients for broadcastPatch,
    // so waitForNextPatch would never resolve. Give the server a tick to finish
    // its async onLeave before asserting.
    await new Promise((r) => setTimeout(r, 50));

    expect(room.state.cursors.size).toBe(0);
  });
});

describe("FarmRoom — plant", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); await resetDb(); });

  it("planta numa terra vazia e persiste no banco", async () => {
    const farm = await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 3, y: 5, cropType: "carrot" });
    await room.waitForNextPatch();

    expect(room.state.crops.get("3,5")?.cropType).toBe("carrot");
    expect(await getFarmCrops(farm.id)).toHaveLength(1);
  });

  it("rejeita plantar em terra ocupada", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 1, y: 1, cropType: "carrot" });
    await room.waitForNextPatch();
    client.send("plant", { x: 1, y: 1, cropType: "corn" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(1);
    expect(room.state.crops.get("1,1")?.cropType).toBe("carrot");
  });

  it("rejeita plantar fora do grid", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 99, y: 0, cropType: "carrot" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });

  it("rejeita cultura desconhecida", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("plant", { x: 2, y: 2, cropType: "banana" });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });
});

describe("FarmRoom — harvest", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); await queryClient.end(); });
  beforeEach(async () => { await colyseus.cleanup(); await resetDb(); });

  it("colhe uma cultura pronta e remove do banco", async () => {
    const farm = await seedSharedFarm();
    const user = await makeUser();
    // cultura plantada bem no passado → já pronta
    await insertCrop({
      farmId: farm.id, x: 2, y: 2, cropType: "carrot", plantedBy: user.id,
      plantedAt: Date.now() - CROP_CATALOG.carrot.growthMs - 5000,
    });
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("harvest", { x: 2, y: 2 });
    await room.waitForNextPatch();

    expect(room.state.crops.has("2,2")).toBe(false);
    expect(await getFarmCrops(farm.id)).toHaveLength(0);
  });

  it("rejeita colher cultura que ainda não cresceu", async () => {
    const farm = await seedSharedFarm();
    const user = await makeUser();
    await insertCrop({
      farmId: farm.id, x: 4, y: 4, cropType: "corn", plantedBy: user.id,
      plantedAt: Date.now(), // recém-plantada
    });
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("harvest", { x: 4, y: 4 });
    await room.waitForNextPatch();

    expect(room.state.crops.has("4,4")).toBe(true);
    expect(await getFarmCrops(farm.id)).toHaveLength(1);
  });

  it("ignora colheita em terra vazia", async () => {
    await seedSharedFarm();
    const user = await makeUser();
    const room = await colyseus.createRoom("farm", {});
    const client = await colyseus.connectTo(room, { token: user.token });
    client.send("harvest", { x: 7, y: 7 });
    await room.waitForNextPatch();

    expect(room.state.crops.size).toBe(0);
  });
});
