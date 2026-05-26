import "../env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./client";

await migrate(db, { migrationsFolder: "./drizzle" });
await queryClient.end();
console.log("Migrações aplicadas.");
