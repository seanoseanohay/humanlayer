# Requirements

## Problem

Developers lack a simple, self-hosted system to run coding agents that
stream real-time execution to a UI while remaining decoupled from the
execution environment.

## Users

-   Solo developer (primary)
-   Reviewer (secondary)

## Use Cases

1.  Create coding session
2.  Observe agent in real-time
3.  Stop session
4.  Run agent locally or remotely

## Functional Requirements

-   Server manages sessions, state, and persistence
-   Agent connects outbound and executes sessions
-   UI streams live events
-   Stop command interrupts execution
-   CLI starts agent

## Constraints

-   TypeScript only
-   No Next.js
-   No paid dependencies
-   Docker Compose required
-   Agent outbound only
-   Restricted shell allowlist

## Key Hypotheses

### H1

Claim: Outbound agent model is sufficient Evidence: Industry patterns
Confidence: High Alternative: Requires bidirectional infra

### H2

Claim: SSE is sufficient for UI Evidence: Simpler browser support
Confidence: Medium Alternative: WebSockets needed for control

### H3

Claim: Restricted shell improves determinism Evidence: Container
reproducibility Confidence: Medium Alternative: Limits agent capability
