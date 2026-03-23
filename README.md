# HumanLayer Headless Coding Agent

A TypeScript-only assessment project that implements a sync-based headless coding agent system with three runtime parts:

- a **server** that owns APIs, persistence, live sync, and session orchestration
- a **headless coding agent / daemon** that connects outbound to the server and executes coding sessions
- a **reactive UI** that lets a user create, observe, and stop sessions in real time

The system is designed to satisfy the HumanLayer take-home constraints:
- all code in TypeScript
- no Next.js
- no prebuilt coding-agent SDKs
- no paid dependencies except an optional LLM API key
- one-command local review via Docker Compose

## Architecture Summary

### Components
**Server**
- exposes HTTP APIs for session creation and stop
- stores sessions, events, agent records, and heartbeats in Postgres
- provides SSE streams for the UI
- provides an outbound WebSocket endpoint for agents

**Agent**
- starts from a CLI command
- connects outbound to the server using a shared secret
- receives session assignments over WebSocket
- runs the agent loop in a restricted workspace shell
- streams execution events back to the server live

**UI**
- single-page app for session list and session detail
- creates sessions via HTTP
- stops sessions via HTTP
- receives live updates through SSE
- replays persisted events on reconnect

### Runtime Shape
The review/demo deployment runs with Docker Compose:
- `server`
- `ui`
- `db`
- `agent-runner`

The architecture remains **remote-capable**: the agent protocol is designed so the daemon can also run outside Compose later as long as it can connect outbound to the server.

### Auth Model
- **UI/app auth:** local stub auth with a seeded development user
- **agent auth:** shared secret presented on agent registration/connect
- no third-party auth provider is required

### Execution Boundary
The agent runs in a restricted workspace:
- limited to a mounted project workspace
- allowlisted commands only
- no runtime package installation
- available tools are baked into the agent image

## Key Design Decisions

### Why SSE for the UI?
The browser only needs durable one-way live updates. SSE is simpler than WebSockets for:
- server-to-browser event streams
- reconnection
- last-event-id / cursor replay
- low operational complexity

### Why WebSockets for the agent?
The agent needs a long-lived outbound control channel for:
- receiving assignments
- heartbeats
- streaming deltas/events
- cooperative stop signaling

### Why local stub auth?
The assignment forbids unnecessary paid services and should run with `docker compose up`. Local stub auth preserves user/session ownership semantics without introducing email, OAuth, or hosted auth complexity.

### Why a restricted shell?
The goal is a real coding agent without sacrificing reproducibility. Restricting the workspace and command set makes the Dockerized review path deterministic and easier to evaluate.

## Planned Stack

This repository is intended to use a stack similar to:

- **Frontend:** React + Vite + TypeScript
- **Server:** Node.js + Fastify or Express + TypeScript
- **Realtime:** SSE for UI, WebSocket for agent transport
- **Database:** Postgres
- **ORM / SQL layer:** Drizzle or Prisma
- **Validation:** Zod
- **Agent loop:** custom TypeScript implementation using provider SDKs only
- **Containers:** Docker + Docker Compose

Final library choices should remain consistent with the docs in `docs/`.

## Core Features

### v1 features
- create a coding session
- persist and list sessions
- dispatch queued work to a connected agent
- stream assistant messages, tool calls, thinking deltas, and status events live
- stop a running session
- recover UI state from persisted events after refresh/reconnect
- run everything with Docker Compose

### Explicitly out of scope for v1
- production multi-tenant auth
- billing
- advanced per-session sandbox virtualization
- multi-agent scheduling
- cloud deployment automation
- collaborative multi-user editing

## Session Lifecycle

Canonical states:
- `queued`
- `assigned`
- `running`
- `stopping`
- `stopped`
- `completed`
- `failed`

Lifecycle rules:
1. UI creates a session through the server.
2. Server persists the session as `queued`.
3. A connected agent receives an assignment over WebSocket.
4. Agent claims and runs the session.
5. Agent streams live events to the server.
6. Server persists events and fans them out to SSE clients.
7. UI may request stop; server marks the session `stopping`.
8. Agent observes stop and exits cooperatively.
9. Server persists the terminal state.

## Event Model

Each persisted event should include:
- `sessionId`
- `sequence`
- `timestamp`
- `type`
- `payload`

Minimum event families:
- lifecycle/status events
- assistant output deltas
- thinking/token deltas
- tool call start/output/end
- structured error events

The server is the source of truth for ordering and replay.

## Repository Structure

```text
.
├── AGENTS.md
├── README.md
├── docs/
│   ├── requirements.md
│   ├── scope.md
│   ├── phases.md
│   ├── architecture.md
│   ├── decisions.md
│   ├── system-map.md
│   ├── constraints.md
│   └── evaluation.md
├── apps/
│   ├── server/
│   ├── ui/
│   └── agent/
├── packages/
│   └── shared/
└── infra/
```

## Getting Started

### Prerequisites
- Docker
- Docker Compose plugin
- optional LLM API key for the provider you choose

### Environment
Create a `.env` file at the repo root.

Minimum expected variables:

```env
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=humanlayer
DATABASE_URL=postgres://app:app@db:5432/humanlayer

APP_USER_EMAIL=reviewer@example.com
APP_USER_PASSWORD=reviewer

AGENT_SHARED_SECRET=replace_me

LLM_PROVIDER=openai
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
```

Only the provider variables needed by the chosen implementation must be set.

### Start the stack
```bash
docker compose up --build
```

Expected containers:
- database
- server
- ui
- agent-runner

### Reviewer flow
1. Create `.env`
2. Run `docker compose up --build`
3. Open the UI in the browser
4. Sign in with the seeded local credentials
5. Create a session
6. Observe live event streaming
7. Stop the session and confirm cooperative halt

## Docker Compose Expectations

The compose project must include:
- a DB container
- a server container
- a UI container or a combined server/UI container
- a separate agent container

Rules:
- server and UI expose the needed ports
- the agent container does **not** expose ports
- the agent connects outbound to the server
- no extra post-start manual setup is required

## API / Transport Outline

### UI → Server
HTTP endpoints such as:
- `POST /sessions`
- `POST /sessions/:id/stop`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /sessions/:id/events` or SSE stream endpoint

### Server → UI
SSE stream for:
- status changes
- assistant deltas
- tool events
- replay after reconnect

### Agent ↔ Server
Outbound WebSocket messages for:
- agent registration/authentication
- heartbeats
- session assignment
- event append
- terminal updates
- stop/cancel notifications

## Evaluation Focus

This project should be evaluated on:
- correctness of session lifecycle
- event durability and ordering
- live sync behavior
- stop reliability
- Docker reproducibility
- clarity of implementation and docs

See `docs/evaluation.md` for detailed scenarios and success criteria.

## Development Process / AI Usage

This project may be implemented with AI assistance, but the coding agent itself must remain a custom implementation and must not depend on the SDK, binary, or source code of an existing prebuilt coding agent.

When AI tools are used, the repository should include:
- the configuration directory used by that tool, if applicable
- any `AGENTS.md`, `CLAUDE.md`, or similar instruction files
- a brief note about process and methodology

## Demo Video

The final submission should include a Loom or other web-viewable demo link here:

- `Demo video:` add final link before submission

## Current Documentation
Project specs live in:
- `docs/requirements.md`
- `docs/scope.md`
- `docs/phases.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/system-map.md`
- `docs/constraints.md`
- `docs/evaluation.md`

## Status
This repository is structured as an execution-ready spec and implementation scaffold target for the HumanLayer assessment. The next implementation milestone is Phase 0 scaffold followed by vertical slices for:
1. persistence and session API
2. agent registration and assignment
3. live event sync
4. stop control
5. end-to-end Docker validation
