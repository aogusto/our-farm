import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não está definida (verifique o .env da raiz)");
}

export const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });
