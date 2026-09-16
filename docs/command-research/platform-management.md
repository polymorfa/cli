# Platform management command research

- **Status:** Organization-key management commands reconciled with the unified
  developer operation surface
- **Reviewed:** 2026-08-20
- **SDK baseline:** `1b99aef26f2b726ecdb00707d5d6a70beb6dc3cd`

## Sources reviewed

- [GitHub CLI reference](https://cli.github.com/manual/gh_help_reference),
  especially resource-oriented list/view/delete trees, bounded list flags,
  machine-readable output, and explicit `--yes` deletion confirmation.
- [GitHub CLI formatting reference](https://cli.github.com/manual/gh_help_formatting),
  separating line-oriented human output from stable JSON automation output.
- [Wrangler secret command source](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/secret/index.ts),
  which names the destructive object in confirmation and never returns stored
  secret values from list operations.
- [Vercel CLI copy guidance](https://github.com/vercel/vercel/blob/main/packages/cli/.agents/skills/cli-ux/references/copy.md),
  especially concrete action/object copy and blast-radius-aware confirmation.
- [GitHub CLI workflow input](https://cli.github.com/manual/gh_workflow_run),
  supporting bounded structured JSON input for multi-field operational actions.
- [Wrangler destructive command behavior](https://github.com/cloudflare/workers-sdk/issues/8995),
  reinforcing explicit remote targeting and confirmation before permanent
  deletion.
- The pinned Polymorfa Platform contract, live handler behavior, and public
  TypeScript SDK.

## Shipped command tree

```text
key
  list
  revoke <key> --yes

member
  list

audit-log
  list [--action <exact>] [--resource <exact>] [--limit <1..500>]

session-ban
  list [--active]

security-incident
  list
  acknowledge <incident>

operation
  list|view|wait|watch|cancel --owner <project|organization>

project-token
  list --project <project>

session
  stop <session...> [--project <project>]
  delete <session...> [--project <project>] --yes
```

The management commands use the public typed organization resources on the
unified SDK `Client`. They require an organization server API key. Reads require
`sessions:read`; key revocation and incident acknowledgement require
`sessions:manage`; batch session stop/delete also require `sessions:manage`.
Project tokens and Messaging browser client tokens are rejected before
transport. Developer operations separately accept the principal allowed by
their explicit owner and context.

## Command decisions

The API method is named `deactivate`; the CLI uses `key revoke` because it
describes the security outcome and matches established credential-management
language. It requires `--yes` and names the key ID. An optional idempotency key
is passed through, but the API does not persist it: retrying after an unseen
success can return not found. JSON preserves `scopes` as reported metadata but
neither human output nor documentation presents that mask as proof of current
authorization.

Member access is deliberately list-only. Invite, role update, and removal use
dashboard sessions and are not crossed through `raw.request`.

Audit action and resource filters are exact matches. The CLI validates the
live handler's 1..500 limit even though the pinned OpenAPI omits those query
fields. Audit, member, ban, incident, key, and token results are complete arrays
without cursor semantics.

`session-ban list --active` keeps one discovery command while selecting the
SDK's distinct active-only operation. Incident acknowledgement is repeatable,
has no confirmation gate, and sends no body. `acknowledgedBy` may be empty when
an organization key performed the acknowledgement.

The original singular Platform operation view has been replaced by the unified
developer `operation list|view|wait|watch|cancel` family with explicit owner and
project context. The unpublished `--surface` selector was removed. Messaging
campaign operation IDs remain a separate API contract and are not passed to the
developer operation resource.
Project-token listing requires an explicit project because the live
organization-key handler rejects an absent project even though its OpenAPI
query field is optional. Only metadata is returned.

Batch session commands use positional IDs because they are the primary action
targets. The CLI trims and validates 1..100 unique IDs before transport instead
of relying on the handler's silent deduplication. `session stop` reports the
matched/queued count and explicitly says it has not waited for completion.
`session delete` requires `--yes`, reports the matched management rows removed,
and identifies device termination as best effort. Neither command compares the
returned count to the requested count or invents per-item outcomes.

The source does not persist idempotency headers for these batch operations.
Retrying a stop can enqueue another stop; retrying deletion reports only rows
still present. Both commands expose an idempotency option for request identity
without claiming stronger server behavior.

## Explicit gaps

There is no organization-key member mutation, API-key creation or rotation,
project-token minting or revocation, raw bearer material, cross-project token
aggregate, incident detail, management-list pagination, security-state
aggregation, or batch per-item result in this slice. Unified developer
operations provide list, view, transition polling, wait, watch, and explicit
cancellation under their own scopes and owner contract; they are not a hidden
extension of the session batch endpoints.
The CLI does not invent those workflows or use the SDK raw escape hatch to cross
dashboard/staff boundaries.

At this exact baseline the SDK ledger records 402 total / 274 curated typed /
128 deliberately excluded operations. The unified client does not leave a
credential-compatible operation in the pinned Messaging and Management
contracts unmapped.
