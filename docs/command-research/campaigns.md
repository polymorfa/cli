# Messaging campaign command research

- **Status:** Campaigns P0 slice: nine lifecycle operations plus recipients,
  audiences and opt-out settings
- **Reviewed:** 2026-09-23
- **SDK baseline:** `8ce8f7bae55fbc03da5a68e5609864d5742dc201`
- **Contract:** `polymorfa/polymorfa` `f4a340da3b74248232ebea73f3e72b42f667beef` (merged `dev`)

The API contract is merged into `dev`, and the SDK dev prerelease
`0.1.0-dev.20260923115544` includes the Campaigns P0 methods. These notes do
not claim deployed availability.

## Sources reviewed

- [GitHub CLI workflow run reference](https://cli.github.com/manual/gh_workflow_run),
  which separates creation of asynchronous work from later run inspection.
- [GitHub CLI run watch reference](https://cli.github.com/manual/gh_run_watch),
  which gives a true wait loop its own command, interval, and terminal exit
  status instead of presenting an accepted request as complete.
- [Stripe CLI usage reference](https://docs.stripe.com/stripe-cli/use-cli),
  where `listen` is a real connected event stream with filtering and local
  forwarding rather than repeated reads presented as streaming.
- [Wrangler Workers command reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/),
  where `tail` is likewise backed by a live log feed and exposes stream-specific
  filters.
- The pinned Polymorfa Messaging contract, live handler behavior, and public
  TypeScript SDK.

## Shipped command tree

```text
campaign
  list --project-slug <slug>
  create --project-slug <slug> --input <file|->
  view <campaign> --project-slug <slug>
  analytics <campaign> --project-slug <slug>
  launch <campaign> --project-slug <slug> [--scheduled-at <ISO|epoch-ms>]
  pause <campaign> --project-slug <slug>
  resume <campaign> --project-slug <slug>
  stop <campaign> --project-slug <slug> --yes
  requeue <campaign> --project-slug <slug> [--include-skipped-error]
  recipients
    add <campaign> --project-slug <slug> (--csv <file> | --input <file|->)
    list <campaign> --project-slug <slug> [--status <status>] [--cursor] [--limit]

audience
  create --name <name> [--csv <file> | --file-id <id> --mapping <file|->]
  members
    add <audience> (--csv <file> | --input <file|->)
    list <audience> [--cursor] [--limit]
    remove <audience> <phone>

optout
  settings
    view
    update --enabled|--no-enabled --opt-out-keyword <word>... [--opt-in-keyword <word>...]
```

The CLI uses only `MessagingClient.campaigns`. Every campaign command requires an
organization Messaging API key. Reads require `campaigns:read`; creation and
lifecycle mutations require `campaigns:manage`. The CLI rejects browser client
tokens before transport. It does not broaden the SDK to project tokens even
though the live middleware has a separately bound project-token path.

## Command decisions

`--project-slug` is explicit because these routes use a slug in their path,
while the global `--project` context is an ID on existing Platform commands.
The CLI does not silently reinterpret one as the other. All path identifiers
are handed to SDK methods that URL-encode them.

Creation reads one bounded JSON object from a file or standard input. It
requires a non-empty `name` before transport and otherwise preserves the public
SDK request shape. There is no server validation route, so no `--dry-run` or
`validate` command is claimed.

`launch` accepts either epoch milliseconds or an ISO 8601 instant with an
explicit timezone. The CLI normalizes ISO input to epoch milliseconds and
rejects timezone-ambiguous local timestamps. Pause, resume, and stop remain
distinct commands because the server enforces different source states. Stop is
a terminal transition and requires `--yes`.

Launch, pause, resume, and stop append durable commands and return an operation
ID plus the campaign's present state. Human output says “Accepted” and does not
say the transition completed. Use `operation view`, `operation wait`, or
`operation watch` to inspect the returned ID through the public Platform
operations resource; `operation cancel` requests supported cancellation.
These commands use their own team/project credential context. The unpublished
`--surface messaging` selector remains removed.

Requeue is different: it is a direct transaction and returns only the number
of recipients moved. Failed recipients are always considered;
`--include-skipped-error` adds recipients skipped with an error. The CLI reports
that count without inventing per-recipient outcomes.

Create, launch, pause, resume and stop accept `--idempotency-key` with a 24-hour
server deduplication window. The middleware is mounted after authentication,
rate limits and client rules, before the campaign routes under `/messaging`.
Its identity includes the credential, project, method, route, API version and
key; the fingerprint includes path parameters and the canonical request body.
A repeated successful request returns `409 idempotency_completed`, not the
original response body. Changed input returns `409 idempotency_conflict`;
in-flight requests return `idempotency_in_progress`, and uncertain outcomes
remain fenced as `idempotency_outcome_unknown`. Do not switch keys merely to
bypass an uncertain result; inspect the campaign or operation first. The SDK
generates a key for create and launch when none is supplied; pause, resume and
stop require the flag to opt into this protection across calls.

Requeue is not in that middleware's operation list. Its handler calls
`CampaignRepository.apiRequeue` directly, so `--idempotency-key` carries no
replay guarantee. Each invocation moves the rows eligible at that moment; a
retry can return zero or move recipients that failed since the first attempt.

Recipient and audience-member appends have no declared replay at all. From SDK
`b663914` the SDK generates no key for them and sends each append once unless
the caller sets both a per-request retry count and a key, and the CLI never
sets a retry count. A resent
append would report the first attempt's rows as duplicates, so the flag help
says the request is not retried.

List returns the complete newest-first array. There is no cursor or automatic
pagination. JSON output preserves complete campaign and analytics objects,
including live counters and forward-compatible fields; human output selects
stable operational fields.

## Campaigns P0 additions

Stop no longer always starts an operation. The contract answers with a nullable
`operationId`: a campaign with no active delivery run is cancelled immediately.
Human output distinguishes the two outcomes instead of printing
"operation null", which is what the previous renderer would have produced.

Recipient listing is the first cursor-paged campaign read. It mirrors the
Platform response exactly (`{data, page}`) rather than collapsing it, so JSON
consumers keep `page.nextCursor` and `page.hasMore`. Automatic multi-page
collection was deliberately not added: the existing `--paginate`/`--max-items`
machinery belongs to the developer-event commands and their owner semantics,
and campaign recipient reads have no owner flag. One page per invocation keeps
the command honest about what it fetched.

Appends accept partial success. The API skips repeated phone numbers and
reports invalid entries rather than rejecting the batch, so the CLI prints
`added`, `duplicateCount`, `invalidCount` and the rejected rows instead of
claiming every entry landed. The 1,000-entry cap is checked before transport so
an oversized file fails with a specific message rather than a 400.

`--csv` reads a spreadsheet locally and sends its rows inline. It does not
implement the API's two-step file upload: that flow issues an upload URL, takes
a POST of the bytes, and returns a storage ID. Inventing a client for it was
out of scope, so `--file-id` accepts a storage ID the caller already obtained
and reaches the server-side import through the documented `mapping` shape.

Column matching follows the API: the exact header first, then a case-folded
match. `--variable name=column` is repeatable. oclif splits repeated flag values
on whitespace, so a column name containing a space must be quoted; this is a
shell-level requirement, not a CLI limitation, and the help text says so.

Opt-out settings are a replace, not a patch. The API requires `enabled`,
`optOutKeywords` and `optInKeywords` together, so the CLI requires
`--enabled`/`--no-enabled` and at least one `--opt-out-keyword`, and refuses a
partial update rather than silently clearing keywords the caller omitted.
Keywords are de-duplicated in order before transport.

The Platform campaign update route accepts `recipientListId` to point an
unlaunched draft at another audience. The CLI exposes no campaign update
command: the Messaging surface the `campaign` topic is built on has no update
route, and the Platform one keeps an open request body. That operation stays
reachable through `polymorfa api`. Adding a `campaign update` command would
mean introducing a Platform-backed command under a Messaging-scoped topic that
already takes `--project-slug` rather than a project ID, which is the confusion
this topic was designed to avoid.

The same revision declares `projectId` as a query parameter on the
single-campaign Platform operations, and a later one declares the `409` that
update answers after launch. No CLI command calls those operations, so no flag
changed. The API schema permits an omitted `projectId` for project tokens;
the SDK's organization-only campaign resource requires it. Its create method
also requires the typed `CreatePlatformCampaignRequest` with a name and project
ID. CLI campaign commands still use the separate Messaging resource with an
explicit project slug.

## Explicit gaps

The Messaging surface now exposes recipient listing and appending; the CLI
covers both. It still exposes no campaign update, delete, archive, duplicate,
validation, event inspection, history, replay, watch, listener, or operation
cancel route. The separate Platform-backed `operation` commands inspect, wait
for and cancel supported campaign operations; they do not add those missing
Messaging campaign routes.

Audience listing, retrieval and deletion, the upload-URL route, and the
single/batch opt-out phone routes remain uncovered by dedicated commands in
this slice: they keep open `PlatformPayload` contracts in the SDK and are
reachable through `polymorfa api`. Only the typed Campaigns P0 operations got
commands.

Stripe `listen` and Wrangler `tail` informed the separate Polymorfa developer
event listener. It is not a campaign watch command and does not change the
campaign API gaps above.

At this exact baseline the SDK ledger records 441 total / 325 covered / 5
missing / 111 excluded / 0 partial / 0 changed operations.
