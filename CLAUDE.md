# CLAUDE.md

## Project Context
This is the HumanLayer take-home assessment — a sync-based headless coding agent system.
See AGENTS.md for full architecture, constraints, and coding standards.

## Key Rules
- All code must be TypeScript with strict mode
- No Next.js, no prebuilt coding agent SDKs
- Agent connects outbound to server only
- Agent container must not expose ports
- Must run with `docker compose up` after `.env` setup
- Make small, coherent commits

## Stack
- Server: Fastify + Drizzle ORM + Postgres
- Agent: Custom LLM loop + OpenAI SDK + ws
- UI: React + Vite + react-router-dom
- Shared: TypeScript types package
- Infra: Docker Compose with 4 services

## Common Commands
```bash
# Build all workspaces
npm run build

# Dev mode (requires local Postgres)
npm run dev -w apps/server
npm run dev -w apps/ui

# Typecheck
npm run typecheck

# Docker
docker compose up --build
docker compose down -v
```
