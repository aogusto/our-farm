import Phaser from "phaser";

export interface CameraPan {
  /** True enquanto o usuário está arrastando a câmera. Use pra suprimir
   *  plant/harvest enquanto está em pan. */
  isPanning(): boolean;
}

function setPanState(state: "grab" | "grabbing" | null): void {
  const gameEl = document.getElementById("game");
  if (!gameEl) return;
  gameEl.classList.toggle("pan-ready", state === "grab");
  gameEl.classList.toggle("panning", state === "grabbing");
}

/**
 * Adiciona pan estilo Figma à câmera principal da cena:
 *   - Botão do meio + arrasta
 *   - Espaço segurado + clique-esquerdo + arrasta
 */
export function setupCameraPan(scene: Phaser.Scene): CameraPan {
  const cam = scene.cameras.main;
  let isPanningNow = false;
  let dragStart: { px: number; py: number; sx: number; sy: number } | null = null;
  let spaceHeld = false;

  const spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  spaceKey?.on("down", () => {
    spaceHeld = true;
    if (!isPanningNow) setPanState("grab");
  });
  spaceKey?.on("up", () => {
    spaceHeld = false;
    if (!isPanningNow) setPanState(null);
  });

  scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
    if (pointer.middleButtonDown() || (spaceHeld && pointer.leftButtonDown())) {
      isPanningNow = true;
      dragStart = { px: pointer.x, py: pointer.y, sx: cam.scrollX, sy: cam.scrollY };
      setPanState("grabbing");
    }
  });

  scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
    if (!isPanningNow || !dragStart) return;
    cam.scrollX = dragStart.sx - (pointer.x - dragStart.px);
    cam.scrollY = dragStart.sy - (pointer.y - dragStart.py);
  });

  const endPan = () => {
    isPanningNow = false;
    dragStart = null;
    setPanState(spaceHeld ? "grab" : null);
  };
  scene.input.on(Phaser.Input.Events.POINTER_UP, endPan);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, endPan);

  return { isPanning: () => isPanningNow };
}
