# Developer events, webhooks, operations, and listener research

- **Status:** Implementation complete against the accepted contract and exact
  SDK pin; deployed Staging acceptance remains a separate gate
- **Reviewed:** 2026-09-08
- **Monorepo baseline:** `6918c56135e28ba64557e344cb72889f1f517eb5`
- **SDK baseline:** `1b99aef26f2b726ecdb00707d5d6a70beb6dc3cd`
- **Listener protocol SHA-256:**
  `0f324f0ce4aa6b39e9af9f4aed51fcce42aa818abae00f9e3e03eb551f35d1ee`

## Sources reviewed

- [GitHub CLI API](https://cli.github.com/manual/gh_api) for a complete-access
  escape hatch that remains separate from curated workflows.
- [GitHub CLI run watch](https://cli.github.com/manual/gh_run_watch) for terminal
  polling, interval handling, and exit behavior.
- [Stripe CLI listen](https://docs.stripe.com/stripe-cli/use-cli) and the
  open-source `stripe-cli` proxy implementation for foreground event filtering,
  local signing, and forwarding. Live transport belongs to the CLI rather than
  the public language SDK.
- [Wrangler tail](https://developers.cloudflare.com/workers/wrangler/commands/#tail)
  for explicit live-stream filters and reconnect-oriented operator feedback.
- The accepted Polymorfa developer API RFC, authoritative OpenAPI documents,
  listener protocol, backend handlers, and public TypeScript SDK contract.

## Command tree

```text
event list|view|replay
webhook list|view|create|update|delete|test
webhook secret rotate
webhook delivery list|view|retry
webhook delivery attempt list|view
operation list|view|wait|watch|cancel
listen
mcp serve|install|uninstall|status|tools|doctor
```

Developer resources have an explicit `project` or `organization` owner. A
stored profile may fix that choice; otherwise `--owner` is required before any
transport. Project ownership also requires exact project context. The CLI never
probes one owner after another and never treats a credential prefix, resource
ID, or failed request as ownership evidence.

All REST commands use the unified SDK `Client` with its typed `events`,
`webhooks`, `webhookDeliveries`, and `operations` resources. `listen` is
different by design: the CLI requests a one-use, short-lived listener
authorization from the configured trusted API origin and opens the Hono SSE
stream itself. No public SDK listener or raw-request workaround is introduced.

## Output and automation

Reads and lists emit schema-versioned envelopes with resource data, owner
context, request metadata, and final-page metadata. Mutations add resource,
operation, and idempotency receipts; inapplicable values are explicit `null`.
Errors are stderr-only, typed, and retain their symbolic condition.

`operation watch --json` is JSONL: ordered, deduplicated transitions followed
by exactly one terminal record. Empty polls emit nothing. Wait and watch never
cancel remote work on a local timeout, signal, transport error, or MCP process
exit.

List collection requires both `--paginate` and `--max-items`; the maximum is
10,000. Each page request shrinks to the remaining budget. Cursors are opaque,
owner- and filter-bound, and cannot be combined with new filters.

## Safety and secret delivery

Delete, rotation, replay, delivery retry, and operation cancellation require a
TTY confirmation or `--yes`. Validation and confirmation happen before the
idempotency key is generated or the transport begins. Every mutation accepts a
caller key up to 255 UTF-8 bytes and preserves its receipt.

Webhook create and secret rotation may return one secret once. Interactive TTY
output may reveal it once. JSON, noninteractive, and MCP workflows require an
exclusive atomic mode-0600 file; secret material is omitted from output and
diagnostics. API success followed by a local file failure is `partial_success`
and rotation is not retried automatically.

## Listener and forwarding

The listener validates filter grammar, project and cursor identifiers,
authorization binding, trusted origins, negotiated limits, every SSE field, and
every typed frame before acknowledging data. It supports UTF-8 and CRLF across
arbitrary chunks, rejects duplicate `event`, `id`, or `data` fields, and
enforces negotiated whole-record and partial-buffer limits. Invalid frames fail
closed and remain unacknowledged.

Events are processed sequentially, which is a stricter bound than negotiated
`maxInFlight`. Acknowledgement occurs only after all required sinks succeed:
stdout for JSONL-only, every destination for forwarding-only, or both stdout
and every destination for combined mode. Checkpoints store only the last
acknowledged cursor.

Forwarding uses ordinary unauthenticated fetch rather than SDK transport.
Loopback HTTP is accepted for development. Remote forwarding requires explicit
opt-in and HTTPS. Redirects are off by default; explicit redirect mode
revalidates the scheme, DNS result, and each address on every hop. Durable and
listener credentials are never forwarded. Local bodies receive an ephemeral
signature suitable for the SDK's exact-byte webhook verifier.

## Implementation-time follow-up

Before each later command extension, recheck the current SDK method and backend
contract, then compare the corresponding maintained OSS command. Record new
filters, pagination, idempotency, confirmation, redaction, and terminal-state
semantics here before adding flags. Do not bend the command tree around an
accidental backend gap; bring a missing product contract to cross-stack design
review before proposing a monorepo change.

The remaining acceptance gate is a deployed Staging E2E at exact Monorepo, SDK,
and CLI commits. It must cover ownership, webhook create/test, delivery and
attempt inspection, wait/watch, replay, forwarding, reconnect/resume, gap
handling, secret non-disclosure, and clean SIGINT. Local and hosted CI do not
substitute for that evidence.
