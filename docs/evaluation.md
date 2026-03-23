# Evaluation

## Test Bundles

### T1

Scenario: Create session Expected: Session stored

### T2

Scenario: Run agent Expected: Events stream

### T3

Scenario: Stop session Expected: Agent halts

## Metrics

-   Latency \< 500ms
-   Event accuracy

## Failure Conditions

-   Lost events
-   Agent not stopping

## Evaluation Process

Run docker compose, execute scenarios, verify logs and UI
