import "./ui/styles.css";
import Phaser from "phaser";
import { ensureIdentity } from "./identity";
import { connectToFarm } from "./net/room";
import { createHud } from "./ui/hud";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { TILE } from "./game/constants";

async function main(): Promise<void> {
  const { token } = await ensureIdentity();
  const room = await connectToFarm(token);
  const hud = createHud();

  const cols = room.state.gridWidth;
  const rows = room.state.gridHeight;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: cols * TILE,
    height: rows * TILE,
    backgroundColor: "#2f3a1f",
  });

  game.scene.add("farm", FarmScene, true, { room, hud, cols, rows } satisfies FarmSceneData);
}

void main();
