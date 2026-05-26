import { config } from "dotenv";
import { resolve } from "node:path";

// O servidor e os testes rodam com cwd = apps/server; o .env vive na raiz.
config({ path: resolve(process.cwd(), "../../.env") });
