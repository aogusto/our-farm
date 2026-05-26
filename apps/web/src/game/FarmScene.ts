import Phaser from "phaser";
import { getCropStage, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";
import { TILE } from "./constants";
import {
  renderTile,
  renderCrop,
  updateCropSprite,
  renderHandCursor,
  renderOffScreenArrow,
} from "./assets";
import { generateDecorations } from "./decorations";
import { setupCameraPan, type CameraPan } from "./camera";
import type { FarmRoom, CursorView, CropView, PlotView } from "../net/room";
import type { Hud } from "../ui/hud";

export interface FarmSceneData {
  room: FarmRoom;
  hud: Hud;
}

const CURSOR_THROTTLE_MS = 50;

export class FarmScene extends Phaser.Scene {
  private room!: FarmRoom;
  private hud!: Hud;
  private pan!: CameraPan;

  // Camadas (containers no z-order correto)
  private bgLayer!: Phaser.GameObjects.Container;
  private decorationsLayer!: Phaser.GameObjects.Container;
  private fenceLayer!: Phaser.GameObjects.Container;
  private dirtLayer!: Phaser.GameObjects.Container;
  private cropsLayer!: Phaser.GameObjects.Container;
  private cursorsLayer!: Phaser.GameObjects.Container;
  private arrowsLayer!: Phaser.GameObjects.Container;
  private ownCursorLayer!: Phaser.GameObjects.Container;

  // Sprite caches keyed por id de cada coisa
  private cursorSprites = new Map<string, Phaser.GameObjects.Container>();
  private arrowSprites = new Map<string, Phaser.GameObjects.Container>();
  private cropSprites = new Map<string, Phaser.GameObjects.Arc>();
  private dirtSprites = new Map<string, Phaser.GameObjects.GameObject>();
  private fenceSprites = new Map<string, Phaser.GameObjects.GameObject>();

  private lastCursorSent = 0;
  private hasLocalPointer = false;
  private plotsSignature = "";  // pra detectar mudança no conjunto de lotes

  constructor() {
    super("farm");
  }

  init(data: FarmSceneData): void {
    this.room = data.room;
    this.hud = data.hud;
  }

  create(): void {
    const cols = this.room.state.gridWidth;
    const rows = this.room.state.gridHeight;
    const worldW = cols * TILE;
    const worldH = rows * TILE;

    // Camadas (ordem z ascendente)
    this.bgLayer = this.add.container(0, 0);
    this.decorationsLayer = this.add.container(0, 0);
    this.dirtLayer = this.add.container(0, 0);
    this.fenceLayer = this.add.container(0, 0);
    this.cropsLayer = this.add.container(0, 0);
    this.cursorsLayer = this.add.container(0, 0);
    this.arrowsLayer = this.add.container(0, 0);
    this.ownCursorLayer = this.add.container(0, 0);

    // Camera bounds = mundo inteiro
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);

    // Render do background (grama) — uma vez só, não muda
    this.drawBackground(cols, rows);

    // Render inicial de lotes + cerca + decorações (depende de room.state.plots)
    this.syncPlotsAndDecorations();

    // Centralizar a camera no centro do conjunto de plots desbloqueados
    const center = this.computePlotsCenter();
    cam.centerOn(center.x, center.y);

    // Setup câmera (pan)
    this.pan = setupCameraPan(this);

    // Input
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  update(): void {
    this.syncCursorsAndArrows();
    this.syncCrops();
    // Plots mudam raramente; só re-renderiza se o conjunto mudou.
    const sig = this.computePlotsSignature();
    if (sig !== this.plotsSignature) {
      this.syncPlotsAndDecorations();
    }
  }

  // ---------- Layers ----------

  private drawBackground(cols: number, rows: number): void {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        this.bgLayer.add(renderTile(this, "grass", tx * TILE, ty * TILE));
      }
    }
  }

  private syncPlotsAndDecorations(): void {
    // 1) Coleta o conjunto atual de lotes desbloqueados.
    const unlocked = new Set<string>();
    this.room.state.plots.forEach((_p: PlotView, key: string) => unlocked.add(key));

    // 2) Limpa camadas que dependem disso.
    this.dirtLayer.removeAll(true);
    this.fenceLayer.removeAll(true);
    this.decorationsLayer.removeAll(true);
    this.dirtSprites.clear();
    this.fenceSprites.clear();

    // 3) Terra (dirt) em cada lote desbloqueado.
    for (const key of unlocked) {
      const [tx, ty] = key.split(",").map(Number);
      const dirt = renderTile(this, "dirt-plot", tx * TILE, ty * TILE);
      this.dirtLayer.add(dirt);
      this.dirtSprites.set(key, dirt);
    }

    // 4) Cerca: pra cada lote desbloqueado, lados que fazem fronteira com não-desbloqueado.
    for (const key of unlocked) {
      const [tx, ty] = key.split(",").map(Number);
      if (!unlocked.has(`${tx},${ty - 1}`)) {
        const s = renderTile(this, "fence-n", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:n`, s);
      }
      if (!unlocked.has(`${tx},${ty + 1}`)) {
        const s = renderTile(this, "fence-s", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:s`, s);
      }
      if (!unlocked.has(`${tx - 1},${ty}`)) {
        const s = renderTile(this, "fence-w", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:w`, s);
      }
      if (!unlocked.has(`${tx + 1},${ty}`)) {
        const s = renderTile(this, "fence-e", tx * TILE, ty * TILE);
        this.fenceLayer.add(s); this.fenceSprites.set(`${key}:e`, s);
      }
    }

    // 5) Decorações procedurais (filtradas pra não pisar em tiles desbloqueados).
    const decos = generateDecorations({
      farmId: this.room.state.farmId,
      gridWidth: this.room.state.gridWidth,
      gridHeight: this.room.state.gridHeight,
      unlockedTiles: unlocked,
    });
    for (const d of decos) {
      this.decorationsLayer.add(renderTile(this, d.kind, d.x * TILE, d.y * TILE));
    }

    this.plotsSignature = this.computePlotsSignature(unlocked);
  }

  private computePlotsSignature(unlocked?: Set<string>): string {
    if (!unlocked) {
      unlocked = new Set();
      this.room.state.plots.forEach((_p: PlotView, key: string) => unlocked!.add(key));
    }
    return [...unlocked].sort().join("|");
  }

  private computePlotsCenter(): { x: number; y: number } {
    let sumX = 0, sumY = 0, n = 0;
    this.room.state.plots.forEach((_p: PlotView, key: string) => {
      const [tx, ty] = key.split(",").map(Number);
      sumX += tx * TILE + TILE / 2;
      sumY += ty * TILE + TILE / 2;
      n++;
    });
    if (n === 0) {
      // Fallback: centro do mundo
      return {
        x: (this.room.state.gridWidth * TILE) / 2,
        y: (this.room.state.gridHeight * TILE) / 2,
      };
    }
    return { x: sumX / n, y: sumY / n };
  }

  // ---------- Input ----------

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pan.isPanning()) return;
    this.hasLocalPointer = true;
    const now = this.time.now;
    if (now - this.lastCursorSent < CURSOR_THROTTLE_MS) return;
    this.lastCursorSent = now;
    this.room.send("cursor", {
      x: Math.round(pointer.worldX),
      y: Math.round(pointer.worldY),
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.pan.isPanning()) return;  // o pan já consumiu este down
    // Defensiva: o pan handler (setupCameraPan) está registrado antes deste,
    // então ele já flippou isPanning quando middle ou space+left dispara.
    // Mas se a ordem de registro mudar no futuro, ou o pan handler perder
    // o evento, ainda evitamos plantar no início de um pan.
    if (pointer.middleButtonDown()) return;
    if (!pointer.leftButtonDown()) return;

    const tx = Math.floor(pointer.worldX / TILE);
    const ty = Math.floor(pointer.worldY / TILE);
    if (tx < 0 || tx >= this.room.state.gridWidth || ty < 0 || ty >= this.room.state.gridHeight) return;

    const key = `${tx},${ty}`;
    const crop = this.room.state.crops.get(key);
    if (crop) {
      const stage = getCropStage(crop.cropType as CropType, crop.plantedAt, Date.now());
      if (stage.harvestable) {
        this.room.send("harvest", { x: tx, y: ty });
      }
      return;
    }
    this.room.send("plant", { x: tx, y: ty, cropType: this.hud.selectedCrop });
  }

  // ---------- Sync loops ----------

  private syncCursorsAndArrows(): void {
    const cam = this.cameras.main;
    const view = cam.worldView; // Phaser.Geom.Rectangle

    const seenCursors = new Set<string>();
    const seenArrows = new Set<string>();

    this.room.state.cursors.forEach((cursor: CursorView, sessionId: string) => {
      const isOwn = sessionId === this.room.sessionId;

      if (isOwn) {
        // A mãozinha própria sempre aparece (depois do primeiro pointer move)
        // e usa posição LOCAL do ponteiro (sem lag de rede).
        if (!this.hasLocalPointer) return;
        seenCursors.add(sessionId);
        let sprite = this.cursorSprites.get(sessionId);
        if (!sprite) {
          sprite = renderHandCursor(this, cursor.handColor, "");
          this.ownCursorLayer.add(sprite);
          this.cursorSprites.set(sessionId, sprite);
        }
        const p = this.input.activePointer;
        sprite.setPosition(Math.round(p.worldX), Math.round(p.worldY));
        return;
      }

      // Cursor remoto
      const inView = view.contains(cursor.x, cursor.y);
      if (inView) {
        seenCursors.add(sessionId);
        let sprite = this.cursorSprites.get(sessionId);
        if (!sprite) {
          sprite = renderHandCursor(this, cursor.handColor, cursor.nickname);
          this.cursorsLayer.add(sprite);
          this.cursorSprites.set(sessionId, sprite);
        }
        sprite.setPosition(cursor.x, cursor.y);
      } else {
        seenArrows.add(sessionId);
        let arrow = this.arrowSprites.get(sessionId);
        if (!arrow) {
          arrow = renderOffScreenArrow(this, cursor.handColor, cursor.nickname);
          this.arrowsLayer.add(arrow);
          this.arrowSprites.set(sessionId, arrow);
        }
        // Projeta a posição do cursor remoto na borda da viewport.
        const margin = 20;
        const cx = view.centerX;
        const cy = view.centerY;
        const dx = cursor.x - cx;
        const dy = cursor.y - cy;
        const halfW = view.width / 2 - margin;
        const halfH = view.height / 2 - margin;
        const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
        const projX = cx + dx / scale;
        const projY = cy + dy / scale;
        arrow.setPosition(projX, projY);
        arrow.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      }
    });

    // Limpa cursores/setas de sessões que sumiram
    for (const [sessionId, sprite] of this.cursorSprites) {
      if (!seenCursors.has(sessionId)) {
        sprite.destroy();
        this.cursorSprites.delete(sessionId);
      }
    }
    for (const [sessionId, arrow] of this.arrowSprites) {
      if (!seenArrows.has(sessionId)) {
        arrow.destroy();
        this.arrowSprites.delete(sessionId);
      }
    }
  }

  private syncCrops(): void {
    const now = Date.now();
    const seen = new Set<string>();
    this.room.state.crops.forEach((crop: CropView, key: string) => {
      seen.add(key);
      const [tx, ty] = key.split(",").map(Number);
      const cropType = crop.cropType as CropType;
      let sprite = this.cropSprites.get(key);
      if (!sprite) {
        sprite = renderCrop(this, cropType, tx * TILE, ty * TILE);
        this.cropsLayer.add(sprite);
        this.cropSprites.set(key, sprite);
      }
      updateCropSprite(sprite, cropType, crop.plantedAt, now);
    });
    for (const [key, sprite] of this.cropSprites) {
      if (!seen.has(key)) {
        sprite.destroy();
        this.cropSprites.delete(key);
      }
    }
  }
}
