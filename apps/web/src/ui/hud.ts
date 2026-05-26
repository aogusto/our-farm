import { CROP_TYPES, CROP_CATALOG } from "@our-farm/shared";
import type { CropType } from "@our-farm/shared";

export interface Hud {
  /** Cultura atualmente selecionada para plantar. */
  readonly selectedCrop: CropType;
}

/** Monta a barra de seleção de cultura e devolve o estado vivo do HUD. */
export function createHud(): Hud {
  const container = document.getElementById("hud");
  if (!container) throw new Error("#hud não encontrado");

  let selected: CropType = CROP_TYPES[0];
  const buttons = new Map<CropType, HTMLButtonElement>();

  for (const cropType of CROP_TYPES) {
    const button = document.createElement("button");
    button.className = "hud__crop";
    button.textContent = CROP_CATALOG[cropType].label;
    button.addEventListener("click", () => {
      selected = cropType;
      for (const [type, el] of buttons) {
        el.classList.toggle("hud__crop--active", type === selected);
      }
    });
    buttons.set(cropType, button);
    container.appendChild(button);
  }
  buttons.get(selected)?.classList.add("hud__crop--active");

  return {
    get selectedCrop() {
      return selected;
    },
  };
}
