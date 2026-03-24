import { FastifyInstance } from "fastify";
import { eq, gt, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { eventBus } from "../events/bus.js";
import { sessionIdParamSchema } from "../validation.js";

export async function sseRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /sessions/:id/events/stream
   *
   * SSE endpoint for live session events.
   * Supports reconnect via Last-Event-ID header — replays all events
   * with sequence > lastEventId, then streams new events live.
   */
  app.get("/sessions/:id/events/stream", async (request, reply) => {
    const parsed = sessionIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const sessionId = parsed.data.id;

    // Verify session exists
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Replay persisted events from cursor
    const lastEventId = request.headers["last-event-id"];
    const cursor = lastEventId ? parseInt(String(lastEventId), 10) : 0;

    const pastEvents = await db
      .select()
      .from(schema.sessionEvents)
      .where(
        cursor > 0
          ? and(
              eq(schema.sessionEvents.sessionId, sessionId),
              gt(schema.sessionEvents.sequence, cursor)
            )
          : eq(schema.sessionEvents.sessionId, sessionId)
      )
      .orderBy(schema.sessionEvents.sequence);

    for (const event of pastEvents) {
      writeSSE(reply.raw, event.sequence, {
        id: event.id,
        sessionId: event.sessionId,
        sequence: event.sequence,
        timestamp: event.timestamp.toISOString(),
        type: event.type,
        payload: event.payload as Record<string, unknown>,
      });
    }

    // Stream new events live
    const listener = (event: {
      id: string;
      sequence: number;
      timestamp: string;
      type: string;
      payload: Record<string, unknown>;
    }) => {
      writeSSE(reply.raw, event.sequence, event);
    };

    eventBus.onSessionEvent(sessionId, listener);

    // Send keepalive every 15s
    const keepalive = setInterval(() => {
      reply.raw.write(":keepalive\n\n");
    }, 15_000);

    // Cleanup on disconnect
    request.raw.on("close", () => {
      clearInterval(keepalive);
      eventBus.offSessionEvent(sessionId, listener as (...args: unknown[]) => void);
    });
  });
}

function writeSSE(
  res: { write: (chunk: string) => void },
  id: number,
  data: Record<string, unknown>
): void {
  res.write(`id: ${id}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
