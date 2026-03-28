import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getSession, stopSession, sendMessage, type Session, API_BASE } from "../api";
import { useSessionEvents } from "../hooks/useSessionEvents";
import Markdown from "react-markdown";

const TERMINAL_STATUSES = ["stopped", "completed", "failed"];

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !messageText.trim()) return;
    setSending(true);
    try {
      await sendMessage(id, messageText.trim());
      setMessageText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

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

      {session.status !== "stopped" && session.status !== "failed" && (
        <form onSubmit={handleSendMessage} className="message-form">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Send a follow-up message..."
            disabled={sending}
          />
          <button type="submit" disabled={sending || !messageText.trim()}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EventItem({
  event,
}: {
  event: {
    sessionId: string;
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
    case "tool_call_started": {
      const args = payload["arguments"] as Record<string, unknown> | undefined;
      const formattedArgs = args ? JSON.stringify(args, null, 2) : "{}";
      content = `${payload["name"]}(${formattedArgs})`;
      break;
    }
    case "tool_call_output": {
      const output = String(payload["output"] ?? "");
      const err = payload["error"] ? `Error: ${payload["error"]}` : "";
      content = err || output;
      break;
    }
    case "tool_call_completed":
      content = `${payload["name"]} done`;
      break;
    case "file_created": {
      const filePath = String(payload["path"] ?? "");
      const fileSize = Number(payload["size"] ?? 0);
      content = `File created: ${filePath} (${formatBytes(fileSize)})`;
      break;
    }
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
    case "user_message":
      content = String(payload["content"] ?? "");
      break;
    default:
      content = JSON.stringify(payload);
  }

  const isLong = content.length > 300;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayContent = isLong && !expanded ? content.slice(0, 300) + "..." : content;

  const showCopy =
    event.type === "tool_call_output" ||
    event.type === "tool_call_started" ||
    event.type === "assistant_message_completed" ||
    event.type === "assistant_message_delta";

  const showDownload = event.type === "file_created";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`event-item event-${event.type}`}>
      <div className="event-meta">
        <span className="event-seq">#{event.sequence}</span>
        <span className="event-type">{event.type}</span>
        <span className="event-actions">
          {showDownload && (
            <a
              className="download-btn"
              href={`${API_BASE}/sessions/${event.sessionId}/files/${payload["path"]}`}
              download
            >
              Download
            </a>
          )}
          {showCopy && (
            <button className="copy-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </span>
        <span className="event-time">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {event.type === "assistant_message_delta" ||
      event.type === "assistant_message_completed" ||
      event.type === "user_message" ? (
        <div className="event-content event-markdown">
          <Markdown>{displayContent}</Markdown>
        </div>
      ) : (
        <pre className="event-content">{displayContent}</pre>
      )}
      {isLong && (
        <button
          className="expand-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}
