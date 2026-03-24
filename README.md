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

## Stack

- **Frontend:** React + Vite + TypeScript
- **Server:** Node.js + Fastify + TypeScript
- **Realtime:** SSE for UI, WebSocket for agent transport
- **Database:** Postgres
- **ORM / SQL layer:** Drizzle ORM
- **Validation:** Zod
- **Agent loop:** custom TypeScript implementation using OpenAI SDK for LLM calls
- **Containers:** Docker + Docker Compose

## Core Features

- Create coding sessions from the UI
- Persist and list sessions with status tracking
- Dispatch queued work to a connected agent
- Stream assistant messages, tool calls, thinking deltas, and status events live
- Stop a running session with cooperative agent halt
- Send follow-up messages to continue iterative conversation
- Recover UI state from persisted events after refresh/reconnect
- Collapsible long event content
- Run everything with `docker compose up`

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
Copy `.env.example` to `.env` and set your LLM API key:

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY (or ANTHROPIC_API_KEY)
```

The default provider is `openai` with model `gpt-4o-mini`. Set `LLM_PROVIDER=anthropic` to use Anthropic instead.

### Start the stack
```bash
docker compose up --build
```

This starts 3 containers:
- **db** — Postgres database
- **server** — API server + UI (serves both on one port)
- **agent-runner** — headless coding agent (no exposed ports)

### Open the UI
Navigate to **http://localhost:3000** (or `SERVER_PORT` if customized).

If port 3000 is in use, set a custom port:
```bash
SERVER_PORT=3002 docker compose up --build
```

### Reviewer flow
1. Copy `.env.example` to `.env` and add your LLM API key
2. Run `docker compose up --build`
3. Open http://localhost:3000 in the browser
4. Create a session (e.g. "Write a hello.txt file with hello world")
5. Click the session to see live event streaming
6. Send a follow-up message after completion
7. Create another session and click Stop to test cooperative halt

## Docker Compose

The compose project includes:
- a **DB container** (Postgres)
- a **server container** that serves both the API and UI
- a separate **agent container** that connects outbound only

Rules:
- server exposes port 3000 (configurable via `SERVER_PORT`)
- the agent container does **not** expose any ports
- the agent connects outbound to the server via WebSocket
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

This project was built with **Claude Code** (Anthropic's CLI coding agent). The implementation process:

1. **Planning phase** — wrote AGENTS.md and docs/ specs defining architecture, constraints, and phases before writing code
2. **Incremental implementation** — built the system in small vertical slices with one commit per logical change (30+ commits in the history)
3. **Phase-by-phase execution** — scaffold → DB/API → agent protocol → UI → stop control → hardening
4. **Continuous verification** — typechecked and Docker-built after each phase to catch issues early

The coding agent itself is a **custom implementation** using only the OpenAI SDK for LLM API calls. It does not use any prebuilt coding agent SDKs.

Included configuration files:
- `AGENTS.md` — architecture and coding standards
- `CLAUDE.md` — project context for Claude Code

## Demo Video

- `Demo video:` *(add final link before submission)*

## Documentation
- `docs/requirements.md` — functional requirements and constraints
- `docs/scope.md` — scope boundaries and priorities
- `docs/phases.md` — implementation phases
- `docs/architecture.md` — system architecture
- `docs/decisions.md` — key design decisions
- `docs/system-map.md` — system entry points and modules
- `docs/constraints.md` — infrastructure constraints
- `docs/evaluation.md` — test scenarios and success criteria

## Status

All core features are implemented and verified:
- Session create/list/detail/stop API
- Agent registration, session assignment, and LLM execution loop
- Live event streaming (SSE) with reconnect/replay
- Cooperative stop with abort support
- Agent disconnect handling
- Event idempotency
- Docker Compose boots all 4 containers from `.env` + `docker compose up`
