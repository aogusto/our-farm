import type { HandShape, HandStyle } from "./types";

export const HAND_SHAPES: HandShape[] = ["point", "open", "pinch"];

export const DEFAULT_HAND_STYLE: HandStyle = { color: "#ffcc00", shape: "point" };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHandShape(v: unknown): v is HandShape {
  return typeof v === "string" && (HAND_SHAPES as string[]).includes(v);
}

/** Aceita entrada não-confiável e devolve sempre um HandStyle válido. */
export function normalizeHandStyle(input: unknown): HandStyle {
  if (typeof input !== "object" || input === null) return { ...DEFAULT_HAND_STYLE };
  const candidate = input as Record<string, unknown>;
  const color = typeof candidate.color === "string" && HEX_RE.test(candidate.color)
    ? candidate.color
    : DEFAULT_HAND_STYLE.color;
  const shape = isHandShape(candidate.shape) ? candidate.shape : DEFAULT_HAND_STYLE.shape;
  return { color, shape };
}
