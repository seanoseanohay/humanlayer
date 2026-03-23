/** Agent registration record */
export interface AgentRecord {
  id: string;
  name: string;
  status: "online" | "offline";
  lastHeartbeat: string;
  connectedAt: string;
}

/**
 * WebSocket message types for the agent ↔ server protocol.
 * Direction is from the perspective of the sender.
 */

// --- Agent → Server ---

export interface AgentRegisterMessage {
  type: "agent:register";
  payload: {
    secret: string;
    name: string;
  };
}

export interface AgentHeartbeatMessage {
  type: "agent:heartbeat";
  payload: {
    agentId: string;
  };
}

export interface AgentEventMessage {
  type: "agent:event";
  payload: {
    sessionId: string;
    event: {
      type: string;
      payload: Record<string, unknown>;
    };
  };
}

export interface AgentSessionUpdateMessage {
  type: "agent:session_update";
  payload: {
    sessionId: string;
    status: string;
  };
}

// --- Server → Agent ---

export interface ServerRegisteredMessage {
  type: "server:registered";
  payload: {
    agentId: string;
  };
}

export interface ServerAssignSessionMessage {
  type: "server:assign_session";
  payload: {
    sessionId: string;
    prompt: string;
  };
}

export interface ServerStopSessionMessage {
  type: "server:stop_session";
  payload: {
    sessionId: string;
  };
}

export interface ServerErrorMessage {
  type: "server:error";
  payload: {
    message: string;
  };
}

/** Union of all WebSocket message types */
export type AgentToServerMessage =
  | AgentRegisterMessage
  | AgentHeartbeatMessage
  | AgentEventMessage
  | AgentSessionUpdateMessage;

export type ServerToAgentMessage =
  | ServerRegisteredMessage
  | ServerAssignSessionMessage
  | ServerStopSessionMessage
  | ServerErrorMessage;

export type WSMessage = AgentToServerMessage | ServerToAgentMessage;
