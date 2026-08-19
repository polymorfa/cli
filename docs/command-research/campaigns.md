# Messaging campaign command research

- **Status:** Complete nine-operation organization-key implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `b4d5f3c8ce51bb0c171264eec8961797314cb172`

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

operation
  view <operation> --surface messaging
```

The CLI uses only `MessagingClient.campaigns` and
`MessagingClient.operations.retrieve`. Every campaign command requires an
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
ID plus the campaign's present state. Human output says “Accepted”, does not say
the transition completed, and gives the exact follow-up command:
`polymorfa operation view <operation> --surface messaging`. The existing
Platform operation lookup remains the default when `--surface` is omitted.
Polymorfa exposes a singular operation read, not a wait or watch API, so the CLI
does not reproduce `gh run watch` with hidden polling semantics.

Requeue is different: it is a direct transaction and returns only the number
of recipients moved. Failed recipients are always considered;
`--include-skipped-error` adds recipients skipped with an error. The CLI reports
that count without inventing per-recipient outcomes.

Every mutation accepts `--idempotency-key` as request identity, but the pinned
handlers do not persist the header. The help text does not claim deduplication:
an unseen successful create can duplicate, a repeated lifecycle request can
conflict or append another intent, and a repeated requeue normally returns
zero after the first transaction moved its eligible recipients.

List returns the complete newest-first array. There is no cursor or automatic
pagination. JSON output preserves complete campaign and analytics objects,
including live counters and forward-compatible fields; human output selects
stable operational fields.

## Explicit gaps

The source exposes no Messaging campaign update, delete, archive, duplicate,
validation, recipient list, event inspection, history, replay, watch, listener,
or operation cancel route. It also exposes no response cursor. The CLI does not
substitute similarly named Platform campaign operations or use `raw.request` to
invent those workflows.

Stripe `listen` and Wrangler `tail` are valuable models for the later
Polymorfa event-development workflow, but both are backed by a real connected
stream. A campaign `watch`, general `listen`, or webhook forwarder remains
reserved until Polymorfa exposes the corresponding listener/session or event
history API.

At this exact baseline the SDK ledger records 331 total / 207 covered / 58
missing / 66 excluded / 0 partial / 0 changed operations.
