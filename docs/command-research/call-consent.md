# Call consent command research

- **Status:** Implemented against the calls-consent API contract, unpublished
- **Reviewed:** 2026-09-20
- **API baseline:** `polymorfa/polymorfa` branch `t3code/calls-consent`,
  commit `16f466066`
- **SDK baseline:** `@polymorfa/sdk` at `polymorfa/sdks` commit
  `94bfd09825817f842434e206e6a77adb5cc0c414`. That commit has no call consent
  resources; see [Transport](#transport).

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

## Transport

Every other curated command family calls a typed SDK resource. The pinned SDK
commit has no `callPolicy`, `callOptOuts`, `voip.check`, or
`voip.retrieveCallPermission` resource, and `SendMessageRequest` does not yet
accept `callPermissionRequest` content, so these commands issue their requests
through the SDK's own raw transport (`client.raw.request`). They keep the SDK's
credential handling, retries, API versioning, response metadata, and typed
error classes; only the resource method is missing. `src/services/call-consent.ts`
declares the response types and is the single place to swap once the SDK ships
those resources.

The `polymorfa/sdks` branch `t3code/calls-consent` (commit
`2c46d082d859e1cae657988dd3ef6890d4fec893`) does add those resources, but that
commit cannot be pinned: the `polymorfa/sdks` repository root package is now
the private workspace root `polymorfa-sdks` with no built `dist`, so
`github:polymorfa/sdks#<commit>` no longer installs `@polymorfa/sdk`. Repinning
needs a published `@polymorfa/sdk` prerelease, not a Git commit.

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
- `@polymorfa/sdk` is not published, and the pinned commit predates the call
  consent surface. These commands cannot move to typed SDK resources until a
  prerelease that contains them can be installed; see
  [Transport](#transport).
