import { sql } from "drizzle-orm";
import { db } from "./index.js";

/**
 * Push schema to the database using raw SQL.
 * This avoids needing drizzle-kit at runtime — we generate the
 * CREATE statements directly from our schema definition.
 */
export async function migrateDatabase(): Promise<void> {
  // Create enums
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE session_status AS ENUM (
        'queued', 'assigned', 'running', 'stopping',
        'stopped', 'completed', 'failed'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE event_type AS ENUM (
        'session_created', 'session_assigned', 'agent_connected',
        'assistant_message_delta', 'assistant_message_completed',
        'thinking_delta', 'tool_call_started', 'tool_call_output',
        'tool_call_completed', 'status_changed', 'error',
        'session_stopped', 'session_completed'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  // Create tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt TEXT NOT NULL,
      status session_status NOT NULL DEFAULT 'queued',
      agent_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES sessions(id),
      sequence INTEGER NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      type event_type NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      last_heartbeat TIMESTAMPTZ,
      connected_at TIMESTAMPTZ
    )
  `);

  // Indexes for common queries
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_session_events_session_seq
    ON session_events (session_id, sequence)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON sessions (status)
  `);
}
