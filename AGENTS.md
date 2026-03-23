# AGENTS.md

## Purpose
This repository implements a sync-based headless coding agent system for the HumanLayer take-home assessment. It includes:
- a server process that owns the database and APIs
- a headless outbound-connecting coding agent / daemon
- a reactive UI that shows live session progress

This file defines how AI coding agents and human contributors should work in this repository.

## Product Intent
Build a TypeScript-only system that:
- allows a user to create a coding session from the UI
- dispatches that session to an outbound-connected agent
- streams tool calls, thinking tokens, assistant messages, and lifecycle events back to the server in real time
- syncs saved events to the UI live
- allows the user to stop a running session
- runs end-to-end with `docker compose up`

## Non-Negotiable Constraints
- Entire codebase must be TypeScript.
- Do not use Next.js.
- Do not use any prebuilt coding-agent SDKs or binaries as the agent implementation.
- Do not require paid services other than an optional LLM API key.
- The agent must connect outbound to the server; the server must never initiate connections to the agent.
- The agent container must not expose ports.
- The project must boot with Docker Compose and reviewer-provided `.env` values only.
- Runtime shell access for the agent is restricted to the mounted workspace and an explicit command allowlist.

## Architecture Decisions
These decisions are fixed unless a human explicitly changes them in `docs/decisions.md`.

### Runtime shape
Compose with remote-capable agent:
- `server` and `ui` run in Compose
- `db` runs in Compose
- `agent-runner` runs in Compose for review/demo
- the same agent protocol must also support running the agent outside Compose later

### Transport
- UI receives live updates via SSE from the server
- UI uses standard HTTP APIs for create/stop actions
- Agent maintains an outbound WebSocket connection to the server for work assignment and event streaming

### Auth
- local stub auth for the UI/app
- separate agent shared secret for daemon registration and session claim
- no external auth providers in v1

### Execution boundary
- agent operates only inside a mounted workspace root
- only allowlisted commands may be executed
- no runtime package installation
- the Docker image defines the available tools up front

## Repository Goals for Agents
Agents working in this repo should optimize for:
1. reviewer reliability
2. deterministic local execution
3. observable behavior
4. small, composable interfaces
5. resumable session/event persistence

## Expected Repository Structure
project/
- AGENTS.md
- README.md
- docs/
  - requirements.md
  - scope.md
  - phases.md
  - architecture.md
  - decisions.md
  - system-map.md
  - constraints.md
  - evaluation.md

Expected implementation structure:
- `apps/server` — API, session orchestration, SSE, WS gateway, DB access
- `apps/ui` — SPA for session list/detail, live stream, stop/create
- `apps/agent` — daemon CLI, agent loop, tool execution, event streaming
- `packages/shared` — types, protocol contracts, validation schemas
- `infra/` — Dockerfiles, compose assets, init scripts
- `docs/` — project documentation

## Required Delivery Features
Every implementation plan and code change must preserve these features:
- create session
- list sessions
- view session detail
- stream live events to the browser
- stop running session
- agent reconnect behavior
- durable event persistence in DB
- reproducible Docker startup

## Protocol Rules
### Session lifecycle
Canonical states:
- `queued`
- `assigned`
- `running`
- `stopping`
- `stopped`
- `completed`
- `failed`

Rules:
- a session starts as `queued`
- only one agent may hold an active lease for a session
- state transitions must be persisted before broadcast when durability matters
- stop requests transition session to `stopping`
- the agent must check for stop signals between tool/execution steps
- terminal states are `stopped`, `completed`, `failed`

### Event model
Persist all user-visible events with:
- `sessionId`
- `sequence`
- `timestamp`
- `type`
- `payload`

Minimum event types:
- session created
- session assigned
- agent connected
- assistant message delta
- assistant message completed
- thinking delta
- tool call started
- tool call output
- tool call completed
- status changed
- error
- session stopped
- session completed

Rules:
- sequence ordering is server-defined
- replay to UI must be based on persisted events, not only transient memory
- SSE clients must be able to reconnect and resume from last event id or sequence cursor

## Coding Standards
- TypeScript strict mode enabled everywhere
- Prefer small modules and explicit interfaces
- Validate all boundary payloads with schemas
- No `any` in protocol or persistence code
- Avoid framework magic; prefer direct and readable patterns
- Keep transport and domain logic separate
- Keep agent loop deterministic and inspectable
- Do not hide important state transitions behind abstractions

## Backend Guidance
- Use a relational DB, preferably Postgres
- Persist sessions, session events, agents, and agent leases/heartbeats
- Use server-generated ids and timestamps
- Make stop requests idempotent
- Expose a minimal HTTP API first, then add live sync
- Treat WS agent messages as authenticated protocol frames, not arbitrary JSON blobs

## UI Guidance
- Keep the UI reviewer-friendly over feature-rich
- Required pages:
  - session list
  - session detail / live stream
  - create session control
- Required controls:
  - create session
  - stop session
- Show:
  - status
  - event timeline
  - latest assistant output
  - connection/replay state
- Do not block UI correctness on fancy styling

## Agent Guidance
- CLI startup must be a single command
- Agent must read config from env
- Agent must register/authenticate with server on connect
- Agent must heartbeat while idle/running
- Agent must claim sessions only through server-issued assignment messages
- Agent must append execution events continuously, not batch only at the end
- Agent must support cooperative stop
- Agent must fail safely and report structured errors

## Tool Execution Policy
Allowed categories:
- shell execution for allowlisted commands only
- file read/write within workspace only
- test/build/typecheck commands present in image
- LLM inference via configured provider SDK/API

Disallowed by default:
- opening inbound ports
- writing outside workspace
- privilege escalation
- package installation during a session
- background daemons unrelated to the session
- destructive commands outside workspace
- hidden network callbacks to arbitrary control planes

## Testing Expectations
Any substantial change should include or update:
- unit tests for protocol/state logic
- integration tests for create/run/stop flows
- transport tests for SSE replay and WS disconnect/reconnect
- at least one end-to-end docker-compose validation path

Critical scenarios:
- agent connects after server boot
- session created before agent is available
- live event stream resumes after browser reconnect
- stop arrives during a running tool step
- agent disconnects mid-session
- duplicate event delivery does not corrupt UI state

## Documentation Rules
When changing architecture or scope:
- update the relevant file in `docs/`
- keep `README.md` accurate for setup and reviewer workflow
- keep `docs/decisions.md` synchronized with final decisions
- do not leave placeholders such as TBD

## Commit / Change Discipline
- Make small, reviewable commits
- Keep each commit coherent
- Update docs when behavior changes
- Prefer incremental vertical slices:
  1. schema + types
  2. API
  3. agent protocol
  4. UI sync
  5. stop semantics
  6. hardening/tests

## Definition of Done
A task is done only when:
- code builds in Docker
- required behavior works end-to-end
- tests for the changed behavior pass
- docs reflect the implementation
- no constraints are violated
- the reviewer can still run with `.env` + `docker compose up`

## Escalation / Uncertainty Rules
If an agent encounters missing information:
- default to the documented architecture and constraints
- prefer the simplest solution consistent with the assessment
- document assumptions in code comments or docs when they affect behavior
- do not invent extra product scope
- do not add external services to solve local problems
