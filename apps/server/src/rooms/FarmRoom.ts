import { Room, type Client } from "colyseus";
import type { User, CursorMessage, PlantMessage } from "@our-farm/shared";
import { validatePlant } from "@our-farm/shared";
import { FarmState, Cursor, CropState, tileKey } from "./schema";
import { getSharedFarm, getFarmCrops, getUserByToken, insertCrop } from "../db/repository";

export class FarmRoom extends Room<{ state: FarmState }> {
  async onCreate(): Promise<void> {
    const farm = await getSharedFarm();
    if (!farm) throw new Error("fazenda compartilhada não foi semeada (rode pnpm db:seed)");

    const state = new FarmState();
    state.farmId = farm.id;
    state.gridWidth = farm.gridWidth;
    state.gridHeight = farm.gridHeight;

    const crops = await getFarmCrops(farm.id);
    for (const crop of crops) {
      const cropState = new CropState();
      cropState.cropType = crop.cropType;
      cropState.plantedAt = crop.plantedAt;
      cropState.plantedBy = crop.plantedBy;
      state.crops.set(tileKey(crop.x, crop.y), cropState);
    }
    this.setState(state);

    this.onMessage("cursor", (client, message: CursorMessage) => {
      this.handleCursor(client, message);
    });

    this.onMessage("plant", (client, message: PlantMessage) => {
      void this.handlePlant(client, message);
    });
  }

  async onAuth(_client: Client, options: { token?: string }): Promise<User> {
    const user = options.token ? await getUserByToken(options.token) : null;
    if (!user) throw new Error("token inválido");
    return user;
  }

  onJoin(client: Client, _options: unknown, user: User): void {
    const cursor = new Cursor();
    cursor.userId = user.id;
    cursor.nickname = user.nickname;
    cursor.handColor = user.handStyle.color;
    cursor.handShape = user.handStyle.shape;
    this.state.cursors.set(client.sessionId, cursor);
  }

  onLeave(client: Client): void {
    this.state.cursors.delete(client.sessionId);
  }

  private handleCursor(client: Client, message: CursorMessage): void {
    const cursor = this.state.cursors.get(client.sessionId);
    if (!cursor) return;
    if (typeof message?.x !== "number" || typeof message?.y !== "number") return;
    cursor.x = message.x;
    cursor.y = message.y;
  }

  private async handlePlant(client: Client, message: PlantMessage): Promise<void> {
    const user = client.auth as User | undefined;
    if (!user) return;
    if (typeof message?.x !== "number" || typeof message?.y !== "number") return;

    const result = validatePlant({
      x: message.x,
      y: message.y,
      cropType: message.cropType,
      occupied: this.state.crops.has(tileKey(message.x, message.y)),
      gridWidth: this.state.gridWidth,
      gridHeight: this.state.gridHeight,
    });
    if (!result.ok) return;

    // Persiste primeiro; só reflete no estado da Room se o banco confirmar.
    const crop = await insertCrop({
      farmId: this.state.farmId,
      x: message.x,
      y: message.y,
      cropType: result.cropType,
      plantedBy: user.id,
    });

    const cropState = new CropState();
    cropState.cropType = crop.cropType;
    cropState.plantedAt = crop.plantedAt;
    cropState.plantedBy = crop.plantedBy;
    this.state.crops.set(tileKey(message.x, message.y), cropState);
  }
}
