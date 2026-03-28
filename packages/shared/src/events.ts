/** All event types the system can produce */
export const EVENT_TYPES = [
  "session_created",
  "session_assigned",
  "agent_connected",
  "assistant_message_delta",
  "assistant_message_completed",
  "thinking_delta",
  "tool_call_started",
  "tool_call_output",
  "tool_call_completed",
  "file_created",
  "status_changed",
  "error",
  "session_stopped",
  "session_completed",
  "user_message",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface SessionEvent {
  id: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: EventType;
  payload: Record<string, unknown>;
}
