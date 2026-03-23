#!/usr/bin/env node

const serverUrl = process.env["SERVER_URL"] ?? "ws://localhost:3000";
const agentSecret = process.env["AGENT_SHARED_SECRET"] ?? "";
const agentName = process.env["AGENT_NAME"] ?? `agent-${process.pid}`;

console.log(`[agent] starting ${agentName}`);
console.log(`[agent] server: ${serverUrl}`);
console.log(`[agent] waiting for implementation...`);

// Placeholder — will be replaced with WS connection + agent loop
process.on("SIGINT", () => {
  console.log("[agent] shutting down");
  process.exit(0);
});

// Keep process alive
setInterval(() => {}, 30_000);
