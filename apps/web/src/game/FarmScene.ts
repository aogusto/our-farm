import Phaser from "phaser";
import { getCropStage, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";
import { TILE, COLORS } from "./constants";
import type { FarmRoom } from "../net/room";
import type { Hud } from "../ui/hud";

export interface FarmSceneData {
  room: FarmRoom;
  hud: Hud;
  cols: number;
  rows: number;
}

const CURSOR_THROTTLE_MS = 50;

const CROP_COLORS: Record<CropType, number> = {
  carrot: 0xff8c1a,
  corn: 0xf2c14e,
};

export class FarmScene extends Phaser.Scene {
  private room!: FarmRoom;
  private hud!: Hud;
  private cols = 16;
  private rows = 16;
  private cursorSprites = new Map<string, Phaser.GameObjects.Container>();
  private cropSprites = new Map<string, Phaser.GameObjects.Arc>();
  private lastCursorSent = 0;

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.room = data.room;
    this.hud = data.hud;
    this.cols = data.cols;
    this.rows = data.rows;
  }

  create(): void {
    this.drawGrid();
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  update(): void {
    this.syncCursors();
    this.syncCrops();
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

  /** Clique numa terra: colhe se houver cultura pronta, senão planta. */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const tx = Math.floor(pointer.worldX / TILE);
    const ty = Math.floor(pointer.worldY / TILE);
    if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return;

    const crop = this.room.state.crops.get(`${tx},${ty}`);
    if (crop) {
      const stage = getCropStage(crop.cropType as CropType, crop.plantedAt, Date.now());
      if (stage.harvestable) {
        this.room.send("harvest", { x: tx, y: ty });
      }
      return;
    }
    this.room.send("plant", { x: tx, y: ty, cropType: this.hud.selectedCrop });
  }

  private syncCursors(): void {
    const seen = new Set<string>();
    this.room.state.cursors.forEach((cursor, sessionId) => {
      if (sessionId === this.room.sessionId) return;
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

  /** Reconcilia as culturas e ajusta o raio conforme o estágio de crescimento. */
  private syncCrops(): void {
    const now = Date.now();
    const seen = new Set<string>();
    this.room.state.crops.forEach((crop, key) => {
      seen.add(key);
      const [tx, ty] = key.split(",").map(Number);
      const cropType = crop.cropType as CropType;
      const def = CROP_CATALOG[cropType];
      const { stage, harvestable } = getCropStage(cropType, crop.plantedAt, now);
      const radius = 4 + ((stage + 1) / def.stages) * (TILE / 2 - 6);

      let sprite = this.cropSprites.get(key);
      if (!sprite) {
        sprite = this.add.circle(
          tx * TILE + TILE / 2,
          ty * TILE + TILE / 2,
          radius,
          CROP_COLORS[cropType],
        );
        this.cropSprites.set(key, sprite);
      }
      sprite.setRadius(radius);
      sprite.setStrokeStyle(harvestable ? 3 : 0, 0xffffff);
    });
    for (const [key, sprite] of this.cropSprites) {
      if (!seen.has(key)) {
        sprite.destroy();
        this.cropSprites.delete(key);
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
