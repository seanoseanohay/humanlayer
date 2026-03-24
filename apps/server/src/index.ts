import Fastify from "fastify";
import cors from "@fastify/cors";
import { migrateDatabase } from "./db/migrate.js";
import { sessionRoutes } from "./routes/sessions.js";
import { sseRoutes } from "./routes/sse.js";
import { wsGateway } from "./ws/gateway.js";

const port = parseInt(process.env["PORT"] ?? "3000", 10);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(sessionRoutes);
await app.register(sseRoutes);
await app.register(wsGateway);

app.get("/health", async () => {
  return { status: "ok" };
});

// Global error handler for unhandled route errors
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode: number }).statusCode
      : 500;
  const message =
    error instanceof Error ? error.message : "Internal server error";
  reply.status(statusCode).send({ error: message });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

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
