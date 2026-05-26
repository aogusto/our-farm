import type { Express } from "express";

/** Rotas HTTP de identidade. Implementadas na Task 10. */
export function registerRoutes(app: Express): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
}
