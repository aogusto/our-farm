CREATE TABLE "farm_plots" (
	"farm_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_plots_farm_id_x_y_pk" PRIMARY KEY("farm_id","x","y")
);
--> statement-breakpoint
ALTER TABLE "farm_plots" ADD CONSTRAINT "farm_plots_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Marco 2: expande a fazenda compartilhada pro mundo grande.
UPDATE "farms" SET "grid_width" = 50, "grid_height" = 40 WHERE "type" = 'shared';
--> statement-breakpoint
-- Starter pack: bloco 6×6 em (10..15, 10..15).
INSERT INTO "farm_plots" ("farm_id", "x", "y")
SELECT f."id", gsx."x" + 10, gsy."y" + 10
FROM "farms" f
CROSS JOIN generate_series(0, 5) AS gsx("x")
CROSS JOIN generate_series(0, 5) AS gsy("y")
WHERE f."type" = 'shared'
ON CONFLICT ("farm_id", "x", "y") DO NOTHING;
--> statement-breakpoint
-- Preserva crops existentes: cada tile com cultura plantada vira lote desbloqueado.
INSERT INTO "farm_plots" ("farm_id", "x", "y")
SELECT "farm_id", "x", "y" FROM "crops"
ON CONFLICT ("farm_id", "x", "y") DO NOTHING;