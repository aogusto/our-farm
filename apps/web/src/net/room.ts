import { Client, type Room } from "colyseus.js";
import { SERVER_WS } from "../config";

export interface CursorView {
  userId: string;
  nickname: string;
  handColor: string;
  handShape: string;
  x: number;
  y: number;
}
export interface CropView {
  cropType: string;
  plantedAt: number;
  plantedBy: string;
}
export interface PlotView {
  unlockedAt: number;
}
export interface FarmStateView {
  farmId: string;
  gridWidth: number;
  gridHeight: number;
  cursors: {
    forEach(cb: (value: CursorView, key: string) => void): void;
    get(key: string): CursorView | undefined;
    size: number;
  };
  crops: {
    forEach(cb: (value: CropView, key: string) => void): void;
    get(key: string): CropView | undefined;
    has(key: string): boolean;
    size: number;
  };
  plots: {
    forEach(cb: (value: PlotView, key: string) => void): void;
    get(key: string): PlotView | undefined;
    has(key: string): boolean;
    size: number;
  };
}

export type FarmRoom = Room<FarmStateView>;

/**
 * Conecta no servidor, entra na Room da fazenda compartilhada e só resolve
 * depois que o primeiro snapshot de estado chegou — assim quem chama já lê
 * `gridWidth`/`crops`/`plots` populados.
 */
export async function connectToFarm(token: string): Promise<FarmRoom> {
  const client = new Client(SERVER_WS);
  const room = await client.joinOrCreate<FarmStateView>("farm", { token });
  if (!room.state.farmId) {
    await new Promise<void>((resolve) => {
      room.onStateChange.once(() => resolve());
    });
  }
  return room;
}
