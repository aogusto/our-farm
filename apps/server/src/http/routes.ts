import type { Application, Request } from "express";
import { normalizeHandStyle } from "@our-farm/shared";
import { createUser, getUserByToken } from "../db/repository";

function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1] : null;
}

export function registerRoutes(app: Application): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/register", async (req, res) => {
    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim() : "";
    if (!nickname) {
      res.status(400).json({ error: "apelido obrigatório" });
      return;
    }
    const handStyle = normalizeHandStyle(req.body?.handStyle);
    const user = await createUser({ nickname, handStyle });
    res.json({ userId: user.id, token: user.token });
  });

  app.get("/api/me", async (req, res) => {
    const token = bearerToken(req);
    const user = token ? await getUserByToken(token) : null;
    if (!user) {
      res.status(401).json({ error: "token inválido" });
      return;
    }
    res.json({ user });
  });
}
