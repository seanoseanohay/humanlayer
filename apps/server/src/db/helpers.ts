import { sql } from "drizzle-orm";
import { db, schema } from "./index.js";
import { eventBus } from "../events/bus.js";

/**
 * Atomically get the next sequence number for a session
 * and insert an event. Uses a subquery to avoid race conditions.
 */
export async function insertSessionEvent(
  sessionId: string,
  type: typeof schema.sessionEvents.$inferInsert.type,
  payload: Record<string, unknown>
) {
  const [event] = await db
    .insert(schema.sessionEvents)
    .values({
      sessionId,
      sequence: sql`(SELECT COALESCE(MAX(sequence), 0) + 1 FROM session_events WHERE session_id = ${sessionId})`,
      type,
      payload,
    })
    .returning();

  // Fan out to SSE
  eventBus.emitSessionEvent(sessionId, {
    id: event.id,
    sequence: event.sequence,
    timestamp: event.timestamp.toISOString(),
    type: event.type,
    payload: event.payload as Record<string, unknown>,
  });

  return event;
}
