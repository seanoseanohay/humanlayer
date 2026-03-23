import Fastify from "fastify";
import cors from "@fastify/cors";

const port = parseInt(process.env["PORT"] ?? "3000", 10);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => {
  return { status: "ok" };
});

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
