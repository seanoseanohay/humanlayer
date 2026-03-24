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

/** Track conversation history per session for follow-ups */
const sessionConversations = new Map<string, { prompt: string }>();

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
    sessionConversations.set(sessionId, { prompt });
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
  onUserMessage: async (sessionId, content) => {
    console.log(`[agent] user message for session ${sessionId}: ${content.slice(0, 50)}`);
    const queue = pendingMessages.get(sessionId) ?? [];
    queue.push(content);
    pendingMessages.set(sessionId, queue);

    // If session isn't currently running, restart the loop as a follow-up
    if (!runningSessions.has(sessionId)) {
      const conv = sessionConversations.get(sessionId);
      if (conv) {
        console.log(`[agent] restarting session ${sessionId} for follow-up`);
        runningSessions.add(sessionId);
        try {
          await runAgentLoop({
            sessionId,
            prompt: content,
            wsClient,
            shouldStop: () => stopRequested.has(sessionId),
            getPendingMessages: () => {
              const msgs = pendingMessages.get(sessionId) ?? [];
              pendingMessages.set(sessionId, []);
              return msgs;
            },
          });
        } catch (err) {
          console.error(`[agent] follow-up session ${sessionId} error:`, err);
          wsClient.sendEvent(sessionId, "error", {
            message: err instanceof Error ? err.message : String(err),
          });
          wsClient.sendSessionUpdate(sessionId, "failed");
        } finally {
          runningSessions.delete(sessionId);
          stopRequested.delete(sessionId);
        }
      }
    }
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
