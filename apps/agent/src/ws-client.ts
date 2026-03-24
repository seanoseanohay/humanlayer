import WebSocket from "ws";
import type {
  AgentToServerMessage,
  ServerToAgentMessage,
} from "@humanlayer/shared";

export interface WSClientOptions {
  serverUrl: string;
  secret: string;
  agentName: string;
  onAssignSession: (sessionId: string, prompt: string) => void;
  onStopSession: (sessionId: string) => void;
  onUserMessage: (sessionId: string, content: string) => void;
  onRegistered: (agentId: string) => void;
}

export class AgentWSClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private agentId: string | null = null;
  private closed = false;

  constructor(private opts: WSClientOptions) {}

  connect(): void {
    if (this.closed) return;

    const wsUrl = `${this.opts.serverUrl}/ws/agent`;
    console.log(`[ws] connecting to ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      console.log("[ws] connected, registering...");
      this.send({
        type: "agent:register",
        payload: {
          secret: this.opts.secret,
          name: this.opts.agentName,
        },
      });
    });

    this.ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as ServerToAgentMessage;

      switch (msg.type) {
        case "server:registered":
          this.agentId = msg.payload.agentId;
          console.log(`[ws] registered as ${this.agentId}`);
          this.opts.onRegistered(this.agentId);
          this.startHeartbeat();
          break;

        case "server:assign_session":
          console.log(`[ws] assigned session ${msg.payload.sessionId}`);
          this.opts.onAssignSession(msg.payload.sessionId, msg.payload.prompt);
          break;

        case "server:stop_session":
          console.log(`[ws] stop requested for session ${msg.payload.sessionId}`);
          this.opts.onStopSession(msg.payload.sessionId);
          break;

        case "server:user_message":
          console.log(`[ws] user message for session ${msg.payload.sessionId}`);
          this.opts.onUserMessage(msg.payload.sessionId, msg.payload.content);
          break;

        case "server:error":
          console.error(`[ws] server error: ${msg.payload.message}`);
          break;
      }
    });

    this.ws.on("close", (code) => {
      console.log(`[ws] disconnected (code: ${code})`);
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error(`[ws] error: ${err.message}`);
    });
  }

  send(msg: AgentToServerMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Send an event for a session back to the server */
  sendEvent(sessionId: string, type: string, payload: Record<string, unknown>): void {
    this.send({
      type: "agent:event",
      payload: { sessionId, event: { type, payload } },
    });
  }

  /** Update session status on the server */
  sendSessionUpdate(sessionId: string, status: string): void {
    this.send({
      type: "agent:session_update",
      payload: { sessionId, status },
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.agentId) {
        this.send({
          type: "agent:heartbeat",
          payload: { agentId: this.agentId },
        });
      }
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    console.log("[ws] reconnecting in 3s...");
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}
