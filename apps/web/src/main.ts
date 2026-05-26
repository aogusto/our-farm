import "./ui/styles.css";
import Phaser from "phaser";
import { FarmScene, type FarmSceneData } from "./game/FarmScene";
import { TILE } from "./game/constants";

const cols = 16;
const rows = 16;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: cols * TILE,
  height: rows * TILE,
  backgroundColor: "#2f3a1f",
});

game.scene.add("farm", FarmScene, true, { cols, rows } satisfies FarmSceneData);
