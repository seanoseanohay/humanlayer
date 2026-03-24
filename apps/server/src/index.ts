import Fastify from "fastify";
import cors from "@fastify/cors";
import { migrateDatabase } from "./db/migrate.js";

const port = parseInt(process.env["PORT"] ?? "3000", 10);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => {
  return { status: "ok" };
});

try {
  app.log.info("Running database migrations...");
  await migrateDatabase();
  app.log.info("Database migrations complete");

  await app.listen({ port, host });
  app.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
