import { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { eventBus } from "../events/bus.js";
import { insertSessionEvent } from "../db/helpers.js";
import type {
  AgentToServerMessage,
  ServerToAgentMessage,
} from "@humanlayer/shared";
import type { WebSocket } from "ws";

function sendWs(ws: WebSocket, msg: ServerToAgentMessage): void {
  ws.send(JSON.stringify(msg));
}

const agentSecret = process.env["AGENT_SHARED_SECRET"] ?? "dev-secret";

interface ConnectedAgent {
  ws: WebSocket;
  agentId: string;
  name: string;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
}

/** Map of agentId → connected agent */
const connectedAgents = new Map<string, ConnectedAgent>();

/** Get a connected agent that can accept work */
export function getAvailableAgent(): ConnectedAgent | undefined {
  for (const agent of connectedAgents.values()) {
    if (agent.ws.readyState === 1) {
      return agent;
    }
  }
  return undefined;
}

/** Send a message to a specific agent */
export function sendToAgent(agentId: string, msg: ServerToAgentMessage): boolean {
  const agent = connectedAgents.get(agentId);
  if (!agent || agent.ws.readyState !== 1) return false;
  agent.ws.send(JSON.stringify(msg));
  return true;
}

export async function wsGateway(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get("/ws/agent", { websocket: true }, (socket) => {
    const ws = socket as unknown as WebSocket;
    let agentId: string | null = null;

    ws.on("message", (raw) => {
      handleMessage(ws, raw, app).catch((err) => {
        app.log.error(`WS message handler error: ${err}`);
        sendWs(ws, {
          type: "server:error",
          payload: { message: "Internal server error" },
        });
      });
    });

    async function handleMessage(
      ws: WebSocket,
      raw: unknown,
      app: FastifyInstance
    ): Promise<void> {
      let msg: AgentToServerMessage;
      try {
        msg = JSON.parse(String(raw)) as AgentToServerMessage;
      } catch {
        sendWs(ws, { type: "server:error", payload: { message: "Invalid JSON" } });
        return;
      }

      switch (msg.type) {
        case "agent:register": {
          if (msg.payload.secret !== agentSecret) {
            sendWs(ws, {
              type: "server:error",
              payload: { message: "Invalid agent secret" },
            });
            ws.close(4001, "Unauthorized");
            return;
          }

          // Upsert agent record
          const [agent] = await db
            .insert(schema.agents)
            .values({
              name: msg.payload.name,
              status: "online",
              connectedAt: new Date(),
              lastHeartbeat: new Date(),
            })
            .returning();

          agentId = agent.id;

          connectedAgents.set(agentId, {
            ws,
            agentId,
            name: agent.name,
            heartbeatTimer: null,
          });

          sendWs(ws, {
            type: "server:registered",
            payload: { agentId },
          });

          app.log.info(`Agent registered: ${agent.name} (${agentId})`);

          // Check for queued sessions to assign
          await tryAssignQueuedSession(agentId, app);
          break;
        }

        case "agent:heartbeat": {
          if (!agentId) return;
          await db
            .update(schema.agents)
            .set({ lastHeartbeat: new Date() })
            .where(eq(schema.agents.id, agentId));
          break;
        }

        case "agent:event": {
          if (!agentId) return;
          const { sessionId, event } = msg.payload;
          await insertSessionEvent(
            sessionId,
            event.type as typeof schema.sessionEvents.$inferInsert.type,
            event.payload,
          );
          break;
        }

        case "agent:session_update": {
          if (!agentId) return;
          const { sessionId, status } = msg.payload;

          await db
            .update(schema.sessions)
            .set({
              status: status as typeof schema.sessions.$inferInsert.status,
              updatedAt: new Date(),
            })
            .where(eq(schema.sessions.id, sessionId));

          await insertSessionEvent(sessionId, "status_changed", { status });
          break;
        }
      }
    }

    ws.on("close", async () => {
      if (agentId) {
        app.log.info(`Agent disconnected: ${agentId}`);
        connectedAgents.delete(agentId);

        // Mark agent offline
        await db
          .update(schema.agents)
          .set({ status: "offline" })
          .where(eq(schema.agents.id, agentId));

        // Fail any non-terminal sessions owned by this agent
        const activeSessions = await db
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.agentId, agentId));

        const nonTerminal = activeSessions.filter(
          (s) => !["stopped", "completed", "failed"].includes(s.status)
        );

        for (const session of nonTerminal) {
          app.log.warn(
            `Failing session ${session.id} due to agent disconnect`
          );

          await db
            .update(schema.sessions)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(schema.sessions.id, session.id));

          await insertSessionEvent(session.id, "error", {
            message: "Agent disconnected unexpectedly",
          });
          await insertSessionEvent(session.id, "status_changed", {
            status: "failed",
            reason: "agent_disconnected",
          });
        }
      }
    });
  });
}

/** Try to assign a queued session to a specific agent */
async function tryAssignQueuedSession(
  agentId: string,
  app: FastifyInstance
): Promise<void> {
  const [queued] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.status, "queued"))
    .orderBy(schema.sessions.createdAt)
    .limit(1);

  if (!queued) return;

  // Assign the session
  await db
    .update(schema.sessions)
    .set({ status: "assigned", agentId, updatedAt: new Date() })
    .where(eq(schema.sessions.id, queued.id));

  const sent = sendToAgent(agentId, {
    type: "server:assign_session",
    payload: { sessionId: queued.id, prompt: queued.prompt },
  });

  if (sent) {
    app.log.info(`Assigned session ${queued.id} to agent ${agentId}`);
  }
}

/** Exported for session creation to trigger assignment */
export { tryAssignQueuedSession as dispatchToAgent };
