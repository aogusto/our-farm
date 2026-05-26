/** Lado de um tile em pixels. */
export const TILE = 40;

/** Viewport fixo do canvas Phaser. O mundo é maior e a camera rola dentro. */
export const VIEWPORT = { width: 1024, height: 640 };

/** Cores do tabuleiro (fallback de placeholder até a arte real entrar). */
export const COLORS = {
  grass: 0x5a8a35,
  grassAlt: 0x4f7b2e,
  soil: 0x8d6e4a,
  soilStroke: 0x6b5234,
  fence: 0x6e4f2a,
  fenceShadow: 0x4a3017,
  tree: 0x2f5a20,
  treeStroke: 0x1a3010,
  treeTrunk: 0x5d3a1a,
  rock: 0x707070,
  arrowOutline: 0xffffff,
};
