/** Canonical session status values */
export const SESSION_STATUSES = [
  "queued",
  "assigned",
  "running",
  "stopping",
  "stopped",
  "completed",
  "failed",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Terminal states — no further transitions allowed */
export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  "stopped",
  "completed",
  "failed",
] as const;

export interface Session {
  id: string;
  prompt: string;
  status: SessionStatus;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionRequest {
  prompt: string;
}

export interface CreateSessionResponse {
  session: Session;
}

export interface SendMessageRequest {
  content: string;
}
