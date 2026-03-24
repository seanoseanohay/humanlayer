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
      await runAgentLoop({
        sessionId,
        prompt,
        wsClient,
        shouldStop: () => stopRequested.has(sessionId),
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
    }
  },
  onStopSession: (sessionId) => {
    console.log(`[agent] stop requested for session ${sessionId}`);
    stopRequested.add(sessionId);
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
