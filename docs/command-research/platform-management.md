# Platform management command research

- **Status:** Public organization management commands; credential management is Console-only; operation inspection is console-only
- **Reviewed:** 2026-10-17
- **SDK baseline:** `08452992a32a392de5fc3d0fa3954ba6addd7f32`

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

session
  stop <session...> [--project <project>]
  delete <session...> [--project <project>] --yes
```

The management commands use the public typed organization resources on the
unified SDK `Client`. They require an organization server API key. Reads require
`sessions:read`; incident acknowledgement requires
`sessions:manage`; batch session stop/delete also require `sessions:manage`.
Project tokens and Messaging browser client tokens are rejected before
transport. Developer operations separately accept the principal allowed by
their explicit owner and context.

## Command decisions

Organization keys and project tokens can only be created, listed and revoked by
a signed-in person in the Console. No machine credential command manages them.

Member access is deliberately list-only. Invite, role update, and removal use
dashboard sessions and are not crossed through `raw.request`.

Audit action and resource filters are exact matches. The CLI validates the
live handler's 1..500 limit even though the pinned OpenAPI omits those query
fields. Audit, member, ban and incident results are complete arrays
without cursor semantics.

`session-ban list --active` keeps one discovery command while selecting the
SDK's distinct active-only operation. Incident acknowledgement is repeatable,
has no confirmation gate, and sends no body. `acknowledgedBy` may be empty when
an organization key performed the acknowledgement.

The original singular Platform operation view was removed. Operation
inspection is console-only at API contract 1600403, and the pinned SDK has no
operations resource, so the CLI ships no operation commands. The unpublished
`--surface` selector was removed.
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
aggregation, batch per-item result, or machine-credential operation inspection
in this slice. Operation list, view, transitions, and cancellation are
console-only routes.
The CLI does not invent those workflows or use the SDK raw escape hatch to cross
dashboard/staff boundaries.

At this exact baseline the SDK ledger records 403 total / 262 covered typed /
106 deliberately excluded / 35 missing operations. The missing entries are
account-health and safe-mode routes outside this command family.
