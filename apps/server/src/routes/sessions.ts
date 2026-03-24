import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createSessionSchema, sessionIdParamSchema } from "../validation.js";
import type { SessionStatus } from "@humanlayer/shared";
import { getAvailableAgent, sendToAgent } from "../ws/gateway.js";

const TERMINAL_STATUSES: SessionStatus[] = ["stopped", "completed", "failed"];

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // POST /sessions — create a new session
  app.post("/sessions", async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const [session] = await db
      .insert(schema.sessions)
      .values({ prompt: parsed.data.prompt })
      .returning();

    // Persist a session_created event
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      sequence: 1,
      type: "session_created",
      payload: { prompt: parsed.data.prompt },
    });

    // Try to dispatch to an available agent immediately
    const agent = getAvailableAgent();
    if (agent) {
      await db
        .update(schema.sessions)
        .set({ status: "assigned", agentId: agent.agentId, updatedAt: new Date() })
        .where(eq(schema.sessions.id, session.id));

      session.status = "assigned";
      session.agentId = agent.agentId;

      sendToAgent(agent.agentId, {
        type: "server:assign_session",
        payload: { sessionId: session.id, prompt: parsed.data.prompt },
      });
    }

    return reply.status(201).send({ session });
  });

  // GET /sessions — list all sessions
  app.get("/sessions", async (_request, reply) => {
    const rows = await db
      .select()
      .from(schema.sessions)
      .orderBy(desc(schema.sessions.createdAt));

    return reply.send({ sessions: rows });
  });

  // GET /sessions/:id — get a single session with its events
  app.get("/sessions/:id", async (request, reply) => {
    const parsed = sessionIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, parsed.data.id));

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const events = await db
      .select()
      .from(schema.sessionEvents)
      .where(eq(schema.sessionEvents.sessionId, parsed.data.id))
      .orderBy(schema.sessionEvents.sequence);

    return reply.send({ session, events });
  });

  // POST /sessions/:id/stop — request session stop
  app.post("/sessions/:id/stop", async (request, reply) => {
    const parsed = sessionIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, parsed.data.id));

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (TERMINAL_STATUSES.includes(session.status as SessionStatus)) {
      return reply.status(409).send({
        error: `Session is already in terminal state: ${session.status}`,
      });
    }

    const [updated] = await db
      .update(schema.sessions)
      .set({ status: "stopping", updatedAt: new Date() })
      .where(eq(schema.sessions.id, parsed.data.id))
      .returning();

    // Notify the agent to stop
    if (session.agentId) {
      sendToAgent(session.agentId, {
        type: "server:stop_session",
        payload: { sessionId: parsed.data.id },
      });
    }

    return reply.send({ session: updated });
  });
}
