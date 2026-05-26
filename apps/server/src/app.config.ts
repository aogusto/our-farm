import config from "@colyseus/tools";
import express from "express";
import cors from "cors";
import { FarmRoom } from "./rooms/FarmRoom";
import { registerRoutes } from "./http/routes";

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define("farm", FarmRoom);
  },
  initializeExpress: (app) => {
    app.use(cors());
    app.use(express.json({ limit: "32kb" }));
    registerRoutes(app);
  },
});
