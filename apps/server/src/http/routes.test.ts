import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../app.config";
import { resetDb } from "../test/db-helpers";

// colyseus.http delegates to httpie, which:
// - takes the body as opts.body (not as second argument)
// - throws on 4xx/5xx responses; the thrown error has .statusCode and .data

describe("rotas de identidade", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await resetDb(); });

  it("POST /api/register cria um usuário e devolve token", async () => {
    const res = await colyseus.http.post("/api/register", {
      body: { nickname: "Bob", handStyle: { color: "#00ff00", shape: "open" } },
    });
    expect(res.data.userId).toBeTruthy();
    expect(res.data.token).toBeTruthy();
  });

  it("POST /api/register rejeita apelido vazio", async () => {
    const err: any = await colyseus.http
      .post("/api/register", { body: { nickname: "  " } })
      .catch((e: unknown) => e);
    expect((err as { statusCode: number }).statusCode).toBe(400);
  });

  it("GET /api/me devolve o usuário para um token válido", async () => {
    const reg = await colyseus.http.post("/api/register", {
      body: { nickname: "Carol", handStyle: { color: "#abcdef", shape: "pinch" } },
    });
    const me = await colyseus.http.get("/api/me", {
      headers: { authorization: `Bearer ${reg.data.token}` },
    });
    expect(me.data.user.nickname).toBe("Carol");
    expect(me.data.user.handStyle.shape).toBe("pinch");
  });

  it("GET /api/me devolve 401 para token inválido", async () => {
    const err: unknown = await colyseus.http
      .get("/api/me", { headers: { authorization: "Bearer nope" } })
      .catch((e: unknown) => e);
    expect((err as { statusCode: number }).statusCode).toBe(401);
  });
});
