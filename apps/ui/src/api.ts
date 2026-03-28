// Use empty string (relative URLs) when served from the same origin as the server
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface Session {
  id: string;
  prompt: string;
  status: string;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function createSession(prompt: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = (await res.json()) as { session: Session };
  return data.session;
}

export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  const data = (await res.json()) as { sessions: Session[] };
  return data.sessions;
}

export async function getSession(
  id: string
): Promise<{ session: Session; events: SessionEvent[] }> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
  return (await res.json()) as { session: Session; events: SessionEvent[] };
}

export async function stopSession(id: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${id}/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to stop session: ${res.status}`);
  const data = (await res.json()) as { session: Session };
  return data.session;
}

export async function sendMessage(sessionId: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
}

export function createEventSource(sessionId: string, lastEventId?: number): EventSource {
  const url = new URL(`${API_BASE}/sessions/${sessionId}/events/stream`);
  const es = new EventSource(url.toString());
  // Note: browser EventSource doesn't support custom Last-Event-ID header on initial connect,
  // but it auto-sends it on reconnect based on the last received id.
  void lastEventId; // Used by browser reconnect mechanism
  return es;
}
