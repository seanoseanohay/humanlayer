import { pgTable, uuid, text, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const sessionStatusEnum = pgEnum("session_status", [
  "queued",
  "assigned",
  "running",
  "stopping",
  "stopped",
  "completed",
  "failed",
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  prompt: text("prompt").notNull(),
  status: sessionStatusEnum("status").notNull().default("queued"),
  agentId: uuid("agent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventTypeEnum = pgEnum("event_type", [
  "session_created",
  "session_assigned",
  "agent_connected",
  "assistant_message_delta",
  "assistant_message_completed",
  "thinking_delta",
  "tool_call_started",
  "tool_call_output",
  "tool_call_completed",
  "status_changed",
  "error",
  "session_stopped",
  "session_completed",
  "user_message",
]);

export const sessionEvents = pgTable("session_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  sequence: integer("sequence").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  type: eventTypeEnum("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
});

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("offline"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
});
