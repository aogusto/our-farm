import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../app.config";
import { queryClient } from "../db/client";
import { resetDb, seedSharedFarm, makeUser } from "../test/db-helpers";

describe("FarmRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); await queryClient.end(); });
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
