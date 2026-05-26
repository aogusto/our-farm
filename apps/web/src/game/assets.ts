import Phaser from "phaser";
import { TILE, COLORS } from "./constants";
import { getCropStage, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";

export type TileKind =
  | "grass"
  | "dirt-plot"
  | "fence-n" | "fence-s" | "fence-e" | "fence-w"
  | "tree"
  | "rock";

export interface TileRenderer {
  (scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.GameObject;
}

const FENCE_THICK = 6;

export const TILE_RENDERERS: Record<TileKind, TileRenderer> = {
  grass: (s, x, y) => {
    const tx = Math.round(x / TILE);
    const ty = Math.round(y / TILE);
    const color = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
    return s.add.rectangle(x, y, TILE, TILE, color).setOrigin(0);
  },
  "dirt-plot": (s, x, y) =>
    s.add.rectangle(x, y, TILE, TILE, COLORS.soil).setOrigin(0).setStrokeStyle(1, COLORS.soilStroke),
  "fence-n": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(0, 0, TILE, FENCE_THICK, COLORS.fence).setOrigin(0));
    c.add(s.add.rectangle(0, FENCE_THICK, TILE, 2, COLORS.fenceShadow).setOrigin(0));
    return c;
  },
  "fence-s": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(0, TILE - FENCE_THICK, TILE, FENCE_THICK, COLORS.fence).setOrigin(0));
    c.add(s.add.rectangle(0, TILE - FENCE_THICK - 2, TILE, 2, COLORS.fenceShadow).setOrigin(0));
    return c;
  },
  "fence-w": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(0, 0, FENCE_THICK, TILE, COLORS.fence).setOrigin(0));
    return c;
  },
  "fence-e": (s, x, y) => {
    const c = s.add.container(x, y);
    c.add(s.add.rectangle(TILE - FENCE_THICK, 0, FENCE_THICK, TILE, COLORS.fence).setOrigin(0));
    return c;
  },
  tree: (s, x, y) => {
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const c = s.add.container(cx, cy);
    const trunk = s.add.rectangle(0, TILE * 0.25, 6, 12, COLORS.treeTrunk).setOrigin(0.5, 0);
    const leaves = s.add.circle(0, 0, TILE * 0.4, COLORS.tree).setStrokeStyle(2, COLORS.treeStroke);
    c.add([trunk, leaves]);
    return c;
  },
  rock: (s, x, y) =>
    s.add.ellipse(x + TILE / 2, y + TILE * 0.6, TILE * 0.5, TILE * 0.35, COLORS.rock),
};

export function renderTile(
  scene: Phaser.Scene,
  kind: TileKind,
  x: number,
  y: number,
): Phaser.GameObjects.GameObject {
  return TILE_RENDERERS[kind](scene, x, y);
}

// ---------- Crops ----------

const CROP_COLORS: Record<CropType, number> = {
  carrot: 0xff8c1a,
  corn: 0xf2c14e,
};

/** Cria um sprite de cultura (estágio inicial). Use `updateCropSprite` pra atualizar. */
export function renderCrop(
  scene: Phaser.Scene,
  cropType: CropType,
  x: number,
  y: number,
): Phaser.GameObjects.Arc {
  return scene.add.circle(x + TILE / 2, y + TILE / 2, 4, CROP_COLORS[cropType]);
}

/** Atualiza o raio (estágio) e o contorno (harvestable) do sprite. */
export function updateCropSprite(
  sprite: Phaser.GameObjects.Arc,
  cropType: CropType,
  plantedAt: number,
  now: number,
): void {
  const def = CROP_CATALOG[cropType];
  const { stage, harvestable } = getCropStage(cropType, plantedAt, now);
  const radius = 4 + ((stage + 1) / def.stages) * (TILE / 2 - 6);
  sprite.setRadius(radius);
  sprite.setStrokeStyle(harvestable ? 3 : 0, 0xffffff);
}

// ---------- Cursors & arrows ----------

/**
 * Mãozinha (própria ou de outro jogador). `nickname` vazio = sem label
 * (útil pra própria mão, onde você não precisa do seu nome).
 */
export function renderHandCursor(
  scene: Phaser.Scene,
  color: string,
  nickname: string,
): Phaser.GameObjects.Container {
  const tint = Phaser.Display.Color.HexStringToColor(color).color;
  const hand = scene.add.triangle(0, 0, 0, 0, 0, 20, 14, 14, tint).setOrigin(0, 0);
  const c = scene.add.container(0, 0, [hand]);
  if (nickname) {
    const label = scene.add.text(16, 14, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 4, y: 2 },
    });
    c.add(label);
  }
  return c;
}

/** Setinha pequena na borda da viewport, apontando pra um jogador off-screen. */
export function renderOffScreenArrow(
  scene: Phaser.Scene,
  color: string,
  nickname: string,
): Phaser.GameObjects.Container {
  const tint = Phaser.Display.Color.HexStringToColor(color).color;
  const arrow = scene.add.triangle(0, 0, -8, 6, 8, 6, 0, -10, tint)
    .setStrokeStyle(1, COLORS.arrowOutline);
  const c = scene.add.container(0, 0, [arrow]);
  if (nickname) {
    const label = scene.add.text(0, 12, nickname, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0);
    c.add(label);
  }
  return c;
}
