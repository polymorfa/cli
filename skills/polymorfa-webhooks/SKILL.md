---
name: polymorfa-webhooks
description: Develop and troubleshoot Polymorfa events and webhooks with the CLI or MCP, including local listen and forwarding, delivery and attempt inspection, tests, replay, retry, and signing-secret rotation.
---

# Polymorfa webhook development

Keep these actions distinct:

- `webhook test` creates a synthetic event and traceable delivery.
- `event replay` creates a new delivery of a retained event to a selected webhook.
- `webhook delivery retry` creates a new immutable attempt on the same delivery.
- `listen` receives the project event stream and may forward locally; it does not create webhook history or alter a delivery.

## Inspect before changing

1. Resolve `--owner` and project context explicitly.
2. Use `event list/view`, `webhook list/view`, `webhook delivery list/view`, and `webhook delivery attempt list/view` to identify exact resources.
3. Use `--paginate --max-items N` together for bounded collection. Never request unbounded history.
4. Request event payloads only when needed. Do not include payloads in diagnostics or summaries by default.

## Listen and forward

Use `polymorfa listen --event ...` for a foreground stream. Repeat `--event` to select more than one pattern. Add `--forward-to` only for a destination the user controls.

- Keep remote redirects disabled.
- Never forward durable API credentials or listener authorization material.
- Treat stream gaps, dropped events, and forwarding failures as explicit nonzero conditions.
- Acknowledge an event only after every configured sink required by the mode has accepted it.
- On reconnect, resume from the last acknowledged checkpoint. Do not skip malformed or oversized frames.
- Stop with SIGINT and verify the listener closes cleanly.

Forwarded requests use a local ephemeral signing secret. Store it only through the CLI's exclusive mode-0600 file option when persistence is required. Application handlers should verify the exact raw request bytes with the Polymorfa SDK.

## Handle one-time webhook secrets

Secret creation and rotation must never put secrets in JSON, JSONL, MCP results, logs, pipes, profiles, or debug output. For noninteractive or JSON use, always pass `--secret-out PATH`; the CLI writes a new mode-0600 file without overwriting. If the API succeeds but local secret delivery fails, record the safe `partial_success` receipt and do not retry rotation automatically.

Destructive or delivery-producing actions require an exact target and the command's confirmation policy. Keep the mutation receipt and operation ID. When the outcome matters, inspect the resulting delivery with `polymorfa webhook delivery view` and its attempts.
