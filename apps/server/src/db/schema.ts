import { pgTable, uuid, text, integer, timestamp, jsonb, unique, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  nickname: text("nickname").notNull(),
  handStyle: jsonb("hand_style").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const farms = pgTable("farms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id),
  type: text("type").notNull(),
  gridWidth: integer("grid_width").notNull(),
  gridHeight: integer("grid_height").notNull(),
});

export const crops = pgTable("crops", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").notNull().references(() => farms.id),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  cropType: text("crop_type").notNull(),
  plantedAt: timestamp("planted_at", { withTimezone: true }).notNull().defaultNow(),
  plantedBy: uuid("planted_by").notNull().references(() => users.id),
}, (table) => ({
  uniqueTile: unique("crops_farm_tile_unique").on(table.farmId, table.x, table.y),
}));

export const farmPlots = pgTable("farm_plots", {
  farmId: uuid("farm_id").notNull().references(() => farms.id),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.farmId, table.x, table.y] }),
}));
