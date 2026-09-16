---
name: polymorfa-operations
description: Inspect, wait for, watch, and safely cancel Polymorfa durable operations through the CLI or MCP while preserving receipts, transition ordering, symbolic terminal states, and remote-work safety.
---

# Polymorfa durable operations

An accepted mutation and a completed mutation are different states. Preserve the resource, operation, idempotency, request, and context fields from every mutation receipt.

## Select the workflow

Supply `--owner project --project PROJECT` for project-owned work or `--owner organization` for organization-owned work. Organization keys are bound to their organization; the CLI does not accept an organization selector that could relabel a request.

- Use `polymorfa operation view OPERATION --owner project --project PROJECT` for one current snapshot.
- Use `polymorfa operation wait OPERATION --owner project --project PROJECT --timeout DURATION` when only the terminal result matters.
- Use `polymorfa operation watch OPERATION --owner project --project PROJECT --json` for ordered JSONL transitions followed by one terminal record.
- Use `polymorfa operation list --owner project --project PROJECT` with bounded filters for discovery.
- Use `polymorfa operation cancel OPERATION --owner project --project PROJECT` only when the user explicitly intends remote cancellation.

Wait and watch poll the typed transition resource. They do not use a live SDK stream. Preserve transition sequence order, suppress duplicates, drain every transition page before sleeping, and honor server retry guidance.

## Interpret outcomes

Treat `succeeded`, `failed`, `cancelled`, and `action_required` as distinct terminal outcomes. Preserve the CLI's symbolic condition rather than treating every non-success as a generic transport error.

A local timeout, process interruption, network failure, or MCP disconnect does not imply that remote work stopped. Report the operation ID and last known state so the caller can resume inspection. Never issue cancellation as cleanup for a failed local wait.

Before cancellation, resolve the exact operation and use the command's TTY confirmation or explicit `--yes`. Keep the idempotency receipt. A cancellation request may move through `cancelling` before `cancelled`, and terminal or unsupported-capability races must remain typed conflicts.
