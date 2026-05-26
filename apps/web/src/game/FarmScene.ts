import Phaser from "phaser";
import { TILE, COLORS } from "./constants";

export interface FarmSceneData {
  cols: number;
  rows: number;
}

export class FarmScene extends Phaser.Scene {
  private cols = 16;
  private rows = 16;

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.cols = data.cols;
    this.rows = data.rows;
  }

  create(): void {
    this.drawGrid();
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const checker = (x + y) % 2 === 0;
        g.fillStyle(checker ? COLORS.soil : COLORS.soilAlt, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    g.lineStyle(1, COLORS.grid, 0.5);
    for (let x = 0; x <= this.cols; x++) {
      g.lineBetween(x * TILE, 0, x * TILE, this.rows * TILE);
    }
    for (let y = 0; y <= this.rows; y++) {
      g.lineBetween(0, y * TILE, this.cols * TILE, y * TILE);
    }
  }
}
