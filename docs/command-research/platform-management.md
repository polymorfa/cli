# Platform management command research

- **Status:** Complete fourteen-operation organization-key implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `c36d151c102d7812977635e677341141721cac9a`

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
  view <operation> [--surface platform|messaging]

project-token
  list --project <project>

widget
  view [--project <project>]
  update [--project <project>] --input <file|->

session
  stop <session...> [--project <project>]
  delete <session...> [--project <project>] --yes
```

The CLI uses the public typed `PlatformClient` resources only. All commands
require an organization server API key. Reads require `sessions:read`; key
revocation and incident acknowledgement require `sessions:manage`. Widget reads
and updates require `widget:create`; batch session stop/delete require
`sessions:manage`. Platform project tokens and Messaging browser client tokens
are rejected before transport.

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

`operation view` is deliberately singular. It defaults to the Platform surface;
the later Messaging campaign slice adds an explicit `--surface messaging`
selection. Either form performs one durable state read and does not imply
polling, waiting, watching, cancellation, or a list route.
Project-token listing requires an explicit project because the live
organization-key handler rejects an absent project even though its OpenAPI
query field is optional. Only metadata is returned.

Widget settings keep target selection outside the JSON patch: `--project`
selects one project row, while its omission selects organization defaults. The
CLI rejects `projectId` inside input so a reviewed settings document cannot hide
its mutation target. A missing saved row remains `null` in JSON and has explicit
human output. Empty patches remain representable because bodyless PUT is a live
compatibility no-op. Logo fields are storage identifiers only; the CLI does not
invent file, URL, base64, multipart, upload, attach, or download behavior.
Human output shows the success and failure callback URLs and whether
recipients can change a prefilled phone number. Those fields replaced the
redirect URI allowlist in the pinned contract.

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
aggregate, incident detail, pagination, operation list/watch/stream/cancel, or
security-state aggregation, widget logo transfer, batch per-item result,
operation ID, completion wait, watch, stream, cancel, or history in this slice.
The CLI does not invent those workflows or use the SDK raw escape hatch to cross
dashboard/staff boundaries.

At this exact baseline the SDK ledger records 331 total / 198 covered / 67
missing / 66 excluded / 0 partial / 0 changed operations.
