#!/usr/bin/env node

import { AgentWSClient } from "./ws-client.js";
import { runAgentLoop } from "./agent-loop.js";

const serverUrl = process.env["SERVER_URL"] ?? "ws://localhost:3000";
const agentSecret = process.env["AGENT_SHARED_SECRET"] ?? "";
const agentName = process.env["AGENT_NAME"] ?? `agent-${process.pid}`;

console.log(`[agent] starting ${agentName}`);
console.log(`[agent] server: ${serverUrl}`);

/** Track which sessions should be stopped */
const stopRequested = new Set<string>();

/** Track running sessions to prevent double-assignment */
const runningSessions = new Set<string>();

/** Queue of pending user messages per session */
const pendingMessages = new Map<string, string[]>();

const wsClient = new AgentWSClient({
  serverUrl,
  secret: agentSecret,
  agentName,
  onRegistered: (agentId) => {
    console.log(`[agent] registered with id ${agentId}`);
  },
  onAssignSession: async (sessionId, prompt) => {
    if (runningSessions.has(sessionId)) {
      console.log(`[agent] session ${sessionId} already running, ignoring`);
      return;
    }

    runningSessions.add(sessionId);
    console.log(`[agent] starting session ${sessionId}`);

    try {
      pendingMessages.set(sessionId, []);
      await runAgentLoop({
        sessionId,
        prompt,
        wsClient,
        shouldStop: () => stopRequested.has(sessionId),
        getPendingMessages: () => {
          const msgs = pendingMessages.get(sessionId) ?? [];
          pendingMessages.set(sessionId, []);
          return msgs;
        },
      });
    } catch (err) {
      console.error(`[agent] session ${sessionId} error:`, err);
      wsClient.sendEvent(sessionId, "error", {
        message: err instanceof Error ? err.message : String(err),
      });
      wsClient.sendSessionUpdate(sessionId, "failed");
    } finally {
      runningSessions.delete(sessionId);
      stopRequested.delete(sessionId);
      pendingMessages.delete(sessionId);
    }
  },
  onStopSession: (sessionId) => {
    console.log(`[agent] stop requested for session ${sessionId}`);
    stopRequested.add(sessionId);
  },
  onUserMessage: (sessionId, content) => {
    console.log(`[agent] user message for session ${sessionId}: ${content.slice(0, 50)}`);
    const queue = pendingMessages.get(sessionId) ?? [];
    queue.push(content);
    pendingMessages.set(sessionId, queue);
  },
});

wsClient.connect();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[agent] shutting down...");
  wsClient.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[agent] shutting down...");
  wsClient.close();
  process.exit(0);
});
