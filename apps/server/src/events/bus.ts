import { EventEmitter } from "node:events";

/**
 * In-process event bus for fanning out persisted events to SSE clients.
 * Events are keyed by sessionId so each SSE connection only receives
 * events for the session it is subscribed to.
 */
class SessionEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow many SSE listeners per session
    this.setMaxListeners(1000);
  }

  /** Emit an event for a specific session */
  emitSessionEvent(sessionId: string, event: {
    id: string;
    sequence: number;
    timestamp: string;
    type: string;
    payload: Record<string, unknown>;
  }): void {
    this.emit(`session:${sessionId}`, event);
  }

  /** Subscribe to events for a specific session */
  onSessionEvent(sessionId: string, listener: (event: {
    id: string;
    sequence: number;
    timestamp: string;
    type: string;
    payload: Record<string, unknown>;
  }) => void): void {
    this.on(`session:${sessionId}`, listener);
  }

  /** Unsubscribe from events for a specific session */
  offSessionEvent(sessionId: string, listener: (...args: unknown[]) => void): void {
    this.off(`session:${sessionId}`, listener);
  }
}

export const eventBus = new SessionEventBus();
