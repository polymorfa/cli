# Platform management command research

- **Status:** Complete ten-operation organization-key implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `fb23a126a99e1448b36716dd66cff4440f21abf6`

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
  view <operation>

project-token
  list --project <project>
```

The CLI uses the public typed `PlatformClient` resources only. All commands
require an organization server API key. Reads require `sessions:read`; key
revocation and incident acknowledgement require `sessions:manage`. Platform
project tokens and Messaging browser client tokens are rejected before
transport.

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

`operation view` is deliberately singular. It performs one durable state read
and does not imply polling, waiting, watching, cancellation, or a list route.
Project-token listing requires an explicit project because the live
organization-key handler rejects an absent project even though its OpenAPI
query field is optional. Only metadata is returned.

## Explicit gaps

There is no organization-key member mutation, API-key creation or rotation,
project-token minting or revocation, raw bearer material, cross-project token
aggregate, incident detail, pagination, operation list/watch/stream/cancel, or
security-state aggregation in this slice. The CLI does not invent those
workflows or use the SDK raw escape hatch to cross dashboard/staff boundaries.

At this exact baseline the SDK ledger records 331 total / 194 covered / 71
missing / 66 excluded / 0 partial / 0 changed operations.
