import { useEffect, useRef, useState, useCallback } from "react";
import type { SessionEvent } from "../api";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export function useSessionEvents(sessionId: string) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const url = `${API_BASE}/sessions/${sessionId}/events/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SessionEvent;
        setEvents((prev) => {
          // Deduplicate by sequence
          if (prev.some((p) => p.sequence === event.sequence)) {
            return prev;
          }
          return [...prev, event].sort((a, b) => a.sequence - b.sequence);
        });
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);

  return { events, connected };
}
