---
name: polymorfa
description: Use the Polymorfa CLI or its local MCP server to inspect and operate Polymorfa resources with explicit profiles, owners, project context, safe machine output, and credential handling. Use for Polymorfa command discovery, authentication, scripting, or agent integrations.
---

# Polymorfa CLI

Use `polymorfa --help` and `polymorfa <topic> --help` as the installed command authority. Do not guess a command or fall back to an authenticated raw request when a typed command is absent.

## Establish context

1. Run `polymorfa auth status --json` before a mutation or a project-scoped read.
2. Select an explicit profile with `--profile` when the active profile is not already unambiguous.
3. For resources that may be project- or organization-owned, supply `--owner project|organization` unless the stored profile fixes the owner.
4. Supply the exact project context for project-owned resources. Never infer ownership from an ID, credential shape, failed request, or route.

Organization API keys and exact-project tokens are durable principals. Browser client tokens and listener credentials are not general CLI credentials. Do not print, log, persist in project files, or pass credentials in command arguments.

Use `polymorfa quicklink create --project PROJECT` for standard number pairing. Treat the returned hosted URL as short-lived credential material; do not request direct session QR payloads or pairing codes.

## Choose an interface

- Use the CLI for human work, shell automation, and JSON/JSONL pipelines.
- Use `polymorfa mcp serve` for an agent that needs structured tools. Inspect the exposed surface with `polymorfa mcp tools` and diagnose setup with `polymorfa mcp doctor`.
- MCP `listen` start/status/stop controls streams owned by that MCP server process. It does not create a detached daemon.

Use `--json` when another program consumes the result. Treat `schemaVersion`, `context`, `request`, pagination metadata, mutation receipts, and symbolic errors as the stable automation contract. Do not scrape human tables or prose.

## Mutate safely

1. Validate input locally before calling the API.
2. Pass a stable `--idempotency-key` when a workflow may retry.
3. Use `--yes` only after the exact target has been resolved and displayed or recorded.
4. Never interpret a returned operation ID as completion. Use `polymorfa operation wait` or `watch` when the workflow needs a terminal result.
5. A local timeout or interruption must not cancel remote work unless an explicit cancel command is issued.

When a command fails, preserve the symbolic error condition and stderr envelope. Do not reduce failures to an exit code alone.
