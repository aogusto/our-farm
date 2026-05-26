import "./ui/styles.css";
import Phaser from "phaser";
import { ensureIdentity } from "./identity";
import { connectToFarm } from "./net/room";
import { createHud } from "./ui/hud";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { VIEWPORT } from "./game/constants";

async function main(): Promise<void> {
  const { token } = await ensureIdentity();
  const room = await connectToFarm(token);
  const hud = createHud();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    backgroundColor: "#1f2515",
  });

  game.scene.add("farm", FarmScene, true, { room, hud } satisfies FarmSceneData);
}

void main();
