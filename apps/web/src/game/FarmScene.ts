import Phaser from "phaser";
import { TILE, COLORS } from "./constants";
import type { FarmRoom } from "../net/room";

export interface FarmSceneData {
  room: FarmRoom;
  cols: number;
  rows: number;
}

const CURSOR_THROTTLE_MS = 50;

export class FarmScene extends Phaser.Scene {
  private room!: FarmRoom;
  private cols = 16;
  private rows = 16;
  private cursorSprites = new Map<string, Phaser.GameObjects.Container>();
  private lastCursorSent = 0;

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.room = data.room;
    this.cols = data.cols;
    this.rows = data.rows;
  }

  create(): void {
    this.drawGrid();
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
  }

  update(): void {
    this.syncCursors();
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

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const now = this.time.now;
    if (now - this.lastCursorSent < CURSOR_THROTTLE_MS) return;
    this.lastCursorSent = now;
    this.room.send("cursor", { x: Math.round(pointer.worldX), y: Math.round(pointer.worldY) });
  }

  /** Reconcilia os containers de cursor com o estado da Room a cada frame. */
  private syncCursors(): void {
    const seen = new Set<string>();
    this.room.state.cursors.forEach((cursor, sessionId) => {
      if (sessionId === this.room.sessionId) return; // não desenha o próprio
      seen.add(sessionId);
      let sprite = this.cursorSprites.get(sessionId);
      if (!sprite) {
        sprite = this.createCursorSprite(cursor.handColor, cursor.nickname);
        this.cursorSprites.set(sessionId, sprite);
      }
      sprite.setPosition(cursor.x, cursor.y);
    });
    for (const [sessionId, sprite] of this.cursorSprites) {
      if (!seen.has(sessionId)) {
        sprite.destroy();
        this.cursorSprites.delete(sessionId);
      }
    }
  }

  private createCursorSprite(color: string, nickname: string): Phaser.GameObjects.Container {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    const hand = this.add.triangle(0, 0, 0, 0, 0, 20, 14, 14, tint).setOrigin(0, 0);
    const label = this.add.text(16, 14, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 4, y: 2 },
    });
    return this.add.container(0, 0, [hand, label]);
  }
}
