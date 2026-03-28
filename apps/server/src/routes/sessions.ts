import { FastifyInstance } from "fastify";
import { resolve, basename } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createSessionSchema, sessionIdParamSchema, sendMessageSchema } from "../validation.js";
import type { SessionStatus } from "@humanlayer/shared";
import { getAvailableAgent, sendToAgent } from "../ws/gateway.js";
import { insertSessionEvent } from "../db/helpers.js";

const TERMINAL_STATUSES: SessionStatus[] = ["stopped", "completed", "failed"];

const WORKSPACE = process.env["WORKSPACE_DIR"] ?? "/workspace";

function resolveWorkspacePath(filePath: string): string {
  const resolved = resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE + "/") && resolved !== WORKSPACE) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return resolved;
}

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

    // Idempotent — if already stopping, return current state
    if (session.status === "stopping") {
      return reply.send({ session });
    }

    // If session is still queued (no agent), go directly to stopped
    const newStatus = session.status === "queued" ? "stopped" : "stopping";

    const [updated] = await db
      .update(schema.sessions)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(schema.sessions.id, parsed.data.id))
      .returning();

    // Persist and fan out status_changed event
    await insertSessionEvent(parsed.data.id, "status_changed", {
      status: newStatus,
      previousStatus: session.status,
    });

    // Notify the agent to stop
    if (session.agentId) {
      sendToAgent(session.agentId, {
        type: "server:stop_session",
        payload: { sessionId: parsed.data.id },
      });
    }

    return reply.send({ session: updated });
  });

  // POST /sessions/:id/message — send a user message to a running session
  app.post("/sessions/:id/message", async (request, reply) => {
    const paramsParsed = sessionIdParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: paramsParsed.error.flatten() });
    }

    const bodyParsed = sendMessageSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: bodyParsed.error.flatten() });
    }

    const sessionId = paramsParsed.data.id;

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    // Only reject messages to stopped/failed sessions
    if (["stopped", "failed"].includes(session.status)) {
      return reply.status(409).send({
        error: `Cannot send message to session in state: ${session.status}`,
      });
    }

    // If session was completed, reactivate it for the follow-up
    const needsReactivation = session.status === "completed";
    if (needsReactivation) {
      await db
        .update(schema.sessions)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(schema.sessions.id, sessionId));
    }

    // Persist user_message event (atomic sequence via helper)
    const event = await insertSessionEvent(sessionId, "user_message", {
      content: bodyParsed.data.content,
    });

    // Forward to agent via WS — try current agent, then any available
    let sent = false;
    if (session.agentId) {
      sent = sendToAgent(session.agentId, {
        type: "server:user_message",
        payload: { sessionId, content: bodyParsed.data.content },
      });
    }
    if (!sent) {
      const agent = getAvailableAgent();
      if (agent) {
        // Update session's agent ID
        await db
          .update(schema.sessions)
          .set({ agentId: agent.agentId, updatedAt: new Date() })
          .where(eq(schema.sessions.id, sessionId));

        sendToAgent(agent.agentId, {
          type: "server:user_message",
          payload: { sessionId, content: bodyParsed.data.content },
        });
      }
    }

    return reply.status(201).send({ event });
  });

  // GET /sessions/:id/files/* — download a workspace file
  app.get("/sessions/:id/files/*", async (request, reply) => {
    const paramsParsed = sessionIdParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: paramsParsed.error.flatten() });
    }

    // Verify session exists
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, paramsParsed.data.id));

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    // Extract the wildcard path
    const wildcardPath = (request.params as Record<string, string>)["*"];
    if (!wildcardPath) {
      return reply.status(400).send({ error: "File path is required" });
    }

    // Resolve with traversal protection
    let resolved: string;
    try {
      resolved = resolveWorkspacePath(wildcardPath);
    } catch {
      return reply.status(400).send({ error: "Invalid file path" });
    }

    if (!existsSync(resolved)) {
      return reply.status(404).send({ error: "File not found" });
    }

    const filename = basename(resolved);
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(createReadStream(resolved));
  });
}
