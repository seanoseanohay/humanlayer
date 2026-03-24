import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getSession, stopSession, type Session } from "../api";
import { useSessionEvents } from "../hooks/useSessionEvents";

const TERMINAL_STATUSES = ["stopped", "completed", "failed"];

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const { events, connected } = useSessionEvents(id!);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getSession(id)
      .then((data) => setSession(data.session))
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [id]);

  // Derive the latest status from events without causing render loops
  useEffect(() => {
    if (events.length === 0) return;

    // Find the latest status from events
    let latestStatus: string | null = null;

    // Check status_changed events (most authoritative)
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "status_changed") {
        latestStatus = (e.payload as { status?: string }).status ?? null;
        break;
      }
    }

    // Also check terminal events
    const lastEvent = events[events.length - 1];
    if (lastEvent?.type === "session_completed") latestStatus = "completed";
    if (lastEvent?.type === "session_stopped") latestStatus = "stopped";

    if (latestStatus) {
      setSession((prev) => {
        if (!prev || prev.status === latestStatus) return prev;
        return { ...prev, status: latestStatus };
      });
      if (["stopped", "completed", "failed"].includes(latestStatus)) {
        setStopping(false);
      }
    }
  }, [events]);

  // Auto-scroll to bottom
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const handleStop = async () => {
    if (!id) return;
    setStopping(true);
    try {
      const updated = await stopSession(id);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <div className="error">{error}</div>
        <Link to="/">Back to sessions</Link>
      </div>
    );
  }

  if (!session) {
    return <div className="page">Loading...</div>;
  }

  const isTerminal = TERMINAL_STATUSES.includes(session.status);
  const isStopping = session.status === "stopping" || stopping;
  const showStopButton = !isTerminal;

  return (
    <div className="page">
      <div className="detail-header">
        <Link to="/" className="back-link">
          &larr; Sessions
        </Link>
        <div className="detail-title">
          <h1>Session</h1>
          <span className={`status status-${session.status}`}>
            {session.status}
          </span>
          <span className={`connection-dot ${connected ? "connected" : ""}`}>
            {connected ? "live" : "reconnecting..."}
          </span>
        </div>
      </div>

      <div className="detail-prompt">
        <strong>Prompt:</strong> {session.prompt}
      </div>

      {showStopButton && (
        <button
          className="stop-button"
          onClick={handleStop}
          disabled={isStopping}
        >
          {isStopping ? "Stopping..." : "Stop Session"}
        </button>
      )}

      <div className="events-container">
        <h2>Events ({events.length})</h2>
        <div className="events-list">
          {events.length === 0 ? (
            <p className="empty">Waiting for events...</p>
          ) : (
            events.map((event) => (
              <EventItem key={event.id ?? event.sequence} event={event} />
            ))
          )}
          <div ref={eventsEndRef} />
        </div>
      </div>
    </div>
  );
}

function EventItem({
  event,
}: {
  event: {
    sequence: number;
    timestamp: string;
    type: string;
    payload: Record<string, unknown>;
  };
}) {
  const payload = event.payload;

  let content: string;
  switch (event.type) {
    case "assistant_message_delta":
    case "assistant_message_completed":
      content = String(payload["content"] ?? "");
      break;
    case "thinking_delta":
      content = String(payload["content"] ?? "");
      break;
    case "tool_call_started":
      content = `${payload["name"]}(${JSON.stringify(payload["arguments"] ?? {})})`;
      break;
    case "tool_call_output": {
      const output = String(payload["output"] ?? "");
      const err = payload["error"] ? `Error: ${payload["error"]}` : "";
      content = err || output.slice(0, 500);
      break;
    }
    case "tool_call_completed":
      content = `${payload["name"]} done`;
      break;
    case "status_changed":
      content = `Status: ${payload["status"]}`;
      break;
    case "error":
      content = String(payload["message"] ?? "Unknown error");
      break;
    case "session_created":
      content = "Session created";
      break;
    case "session_completed":
      content = String(payload["message"] ?? "Completed");
      break;
    case "session_stopped":
      content = String(payload["reason"] ?? "Stopped");
      break;
    default:
      content = JSON.stringify(payload);
  }

  return (
    <div className={`event-item event-${event.type}`}>
      <div className="event-meta">
        <span className="event-seq">#{event.sequence}</span>
        <span className="event-type">{event.type}</span>
        <span className="event-time">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <pre className="event-content">{content}</pre>
    </div>
  );
}
