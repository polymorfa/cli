# Call consent command research

- **Status:** Implemented against the calls-consent API contract, unpublished
- **Reviewed:** 2026-09-20
- **API baseline:** `polymorfa/polymorfa` local consent checkpoint
  `677b39a4a` (unpublished)
- **SDK integration baseline:** `polymorfa/sdks` local consent checkpoint
  `a5acdc980` (unpublished). The CLI uses a temporary local pack for verification; its committed
  npm pin stays on the existing published version until SDK #284 is merged and
  published.

## Sources reviewed

- The API routes in `apps/api/packages/api/src/routes/call-consent.ts` and the
  `callPermissionRequest` content in `routes/messages.ts`.
- The Platform and Messaging OpenAPI operations `getCallPolicy`,
  `updateCallPolicy`, `listCallOptOuts`, `createCallOptOut`,
  `importCallOptOuts`, `deleteCallOptOut`, `getCallPermission`, and
  `checkCall`.
- The public guide for call consent.

## Shipped command tree

```text
calls
  check <to> --session <id>
  policy
    get
    set (--blocked-country-codes <list> | --clear) [--expected-revision <n>]
  opt-outs
    list [--phone-number <e164> | --bsuid <bsuid>] [--limit <1-500>]
         [--cursor <id>] [--paginate --max-items <n>]
    add (--phone-number <e164> | --bsuid <bsuid>) [--note <text>]
    import <file|-> [--format csv|json]
    remove <optOutId> --yes
  permission
    get <to> --session <id>
    request <to> --session <id> --body <text> [--idempotency-key <key>]
```

## Operation mapping

| Command                    | Operation                                        |
| -------------------------- | ------------------------------------------------ |
| `calls policy get`         | `GET /platform/call-policy`                      |
| `calls policy set`         | `PUT /platform/call-policy`                      |
| `calls opt-outs list`      | `GET /platform/call-opt-outs`                    |
| `calls opt-outs add`       | `POST /platform/call-opt-outs`                   |
| `calls opt-outs import`    | `POST /platform/call-opt-outs/import`            |
| `calls opt-outs remove`    | `DELETE /platform/call-opt-outs/{optOutId}`      |
| `calls permission get`     | `GET /messaging/{session}/call-permissions/{to}` |
| `calls permission request` | `POST /messaging/{session}/messages/send`        |
| `calls check`              | `POST /messaging/voip/calls/check`               |

## SDK resources

The commands use the SDK's typed `callPolicy`, `callOptOuts`,
`voip.retrieveCallPermission`, `voip.check`, and `messages.send` methods. The
CLI retains CSV/JSON import parsing, bounded batching, `--max-items` pagination,
rendering, and command-specific validation. `messages.send` generates a unique
idempotency key per command invocation when none is provided. The permission
request command disables automatic network retries so a WhatsApp rate-limit
response and its `Retry-After` value reach the operator promptly.

SDK #284 must merge and publish before this branch can update its exact npm pin.
A local tarball is only a verification input and does not appear in committed
package metadata.

## Credential rules

- `calls policy` and `calls opt-outs` resolve Platform credentials, so they
  require an organization API key. The API answers a project token or client
  token with `403 permission_denied`, which exits with code 3.
- `calls permission get` and `calls check` require a server API key. The CLI
  refuses a Messaging client token before sending a request, because the API
  refuses client tokens on both routes.
- `calls permission request` uses the ordinary messages send route and accepts
  whatever credential that route accepts.

## Command decisions

- **`calls check` always exits 0.** It reports a refusal as data (`allowed`,
  `refusal`), not as a failure, so a script can branch on the answer without
  parsing an error. Transport and authorization problems still fail normally.
- **`--expected-revision` only on `policy set`.** The API takes
  `expectedRevision` only for the blocked country codes; opt-out writes are
  idempotent by identity and take no revision.
- **`--yes` on `remove`.** Removing an entry lets calls reach a person who
  asked not to be called, so the command requires explicit confirmation. Adding
  an entry restricts calling and needs none.
- **No `--idempotency-key` for opt-out writes.** The API defines none:
  `POST /platform/call-opt-outs` already answers `200` with the stored entry
  when it exists, and import counts an existing entry as `existing`.
- **Import batching.** The API accepts 5,000 entries per request. The CLI
  splits a larger file, and each stored batch stays stored: a later failure
  exits with code 12 and names how many batches were stored, so running the
  import again is safe. When nothing was stored the command exits with the
  request's own code and prints no summary.
- **Local import rejections.** The API rejects a whole request when an entry
  exceeds a field length limit, so the CLI rejects those entries itself with
  the reason the API reports for them and sends the rest. Every other
  validation stays with the API, which reports rejections per entry.
- **Import positions.** Rejections are reported with the entry's zero-based
  position in the file and, for CSV, its line number, not the position within
  the request batch.
- **Paging.** `calls opt-outs list` returns one page by default and prints the
  `--cursor` for the next one. `--paginate` requires `--max-items` so an
  unattended run cannot walk 100,000 entries by accident.
- **`Retry-After`.** A rate-limited command reports the wait in its message and
  as `retryAfterSeconds` in `--json` error output, read from the response
  header as delta-seconds or an HTTP date. This applies to every rate-limited
  CLI command, not only call permission requests.

## Explicit gaps

- No command updates an existing opt-out entry's note: the API has no update
  operation. Remove the entry and add it again.
- `calls permission request` cannot send a template that carries a call
  permission request button; use the existing template send.
- The CLI does not subscribe to `call.permission_changed`; use
  `polymorfa event` and webhook commands for that.
- The committed SDK prerelease predates the call consent methods. Publish SDK
  #284 after API #226 merges, then update the CLI's exact npm pin and rerun the
  command checks before merging this branch.
