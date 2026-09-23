# Calls command research

- **Status:** Implemented against Calls contract revision 1, unpublished
- **Reviewed:** 2026-09-19
- **SDK baseline:** `@polymorfa/sdk` (including the `@polymorfa/sdk/calls`
  subpath) `0.1.0-dev.20260922115749` from npm, published from `polymorfa/sdks`
  commit `8bc00778b3b3aaf05b09369c3f7840eb24cf6a56` by
  [workflow run 35724232746](https://github.com/polymorfa/sdks/actions/runs/35724232746).
  The research was done against
  `polymorfa/sdks` commit `94bfd09825817f842434e206e6a77adb5cc0c414`; the npm
  build also reports a `claim` activity when the placed call is answered.

## Sources reviewed

- Integrated Calls contract, revision 1 (September 16, 2026), in the monorepo
  plan for unified call clients.
- Messaging OpenAPI operations `voipPlaceCall`, `voipAcceptCall`,
  `voipRejectCall`, `voipLeaveCall`, `voipTeardown`, and `voipAddParticipant`,
  and the Platform operations `getCallSettings` and `updateCallSettings`.
- The API lifecycle socket handler: first-frame authentication, allowed
  `session` and `participant` query parameters, 60-second re-validation, and
  the 4401, 4409, 4429, 4400, and 1013 close codes.
- The public guide for Calls.
- Platform operations `getCallStats` (`GET /platform/calls/stats`) and
  `exportCallRecords` (`GET /platform/calls/export`) from the management
  OpenAPI document at `polymorfa/polymorfa` commit
  `4b75534812dc25e839fda3c2ba231e46afe39534`, and the export route's
  `Polymorfa-Next-Cursor` header and CSV encoding.
- `MessagingClient.voip` and the public `@polymorfa/sdk/calls` entry point
  (`CallsClient`, `Call`, and the Calls error classes).

`calls check`, `calls policy`, `calls opt-outs`, and `calls permission` are
the team call policy and Cloud API call permission commands; they are
researched in [call-consent.md](call-consent.md).

## Shipped command tree

```text
calls
  place <to> [--session] [--video] [--exclusive] [--participant]
  accept <callId> [--exclusive] [--video|--no-video] [--participant]
  reject <callId> [--participant]
  leave <callId> --connection-id <id> [--participant]
  end <callId>
  invite <callId> <target>
  watch [--session] [--participant] [--count <n>]
  media [callId] [--session] [--place <to>] [--exclusive] [--participant]
        [--input <file|->] [--output <file|->] [--leave-on-eof] [--video]
  stats [--session] [--direction] [--upstream] [--outcome] [--since] [--until]
        [--group-by day|hour|session|outcome] [--timezone <iana>] [--heatmap]
  export [--session] [--direction] [--upstream] [--outcome] [--since] [--until]
         [--format csv|ndjson] [--output <file|->] [--force] [--limit <1-1000>]
         [--cursor <cursor>] [--max-pages <n>]
  settings
    get --session <id>
    set --session <id> [--[no-]conference-mode] [--calls-enabled=<true|false>] ...
```

## Operation mapping

| Command                        | Operation                                        | SDK surface                         |
| ------------------------------ | ------------------------------------------------ | ----------------------------------- |
| `calls place`                  | `POST /messaging/voip/calls`                     | `voip.place`                        |
| `calls accept`                 | `POST /messaging/voip/calls/{id}/accept`         | `voip.accept`                       |
| `calls reject`                 | `POST /messaging/voip/calls/{id}/reject`         | `voip.reject`                       |
| `calls leave`                  | `POST /messaging/voip/calls/{id}/leave`          | `voip.leave`                        |
| `calls end`                    | `DELETE /messaging/voip/calls/{id}`              | `voip.end`                          |
| `calls invite`                 | `POST /messaging/voip/calls/{id}/participants`   | `voip.addParticipant`               |
| `calls settings get`           | `GET /platform/sessions/{session}/call-settings` | `voip.retrieveCallSettings`         |
| `calls settings set`           | `PUT /platform/sessions/{session}/call-settings` | `voip.updateCallSettings`           |
| `calls stats`                  | `GET /platform/calls/stats`                      | `calls.stats`                       |
| `calls export`                 | `GET /platform/calls/export`                     | `calls.export`                      |
| `calls retention get`          | `GET /platform/call-retention`                   | `callRetention.retrieve`            |
| `calls retention set`          | `PUT /platform/call-retention`                   | `callRetention.update`              |
| `sip-trunk endpoint`           | `GET /platform/sip/endpoint`                     | `sipTrunks.endpoint`                |
| `sip-trunk list`               | `GET /platform/sip-trunks`                       | `sipTrunks.list`                    |
| `sip-trunk view`               | `GET /platform/sip-trunks/{id}`                  | `sipTrunks.retrieve`                |
| `sip-trunk create`             | `POST /platform/sip-trunks`                      | `sipTrunks.create`                  |
| `sip-trunk update`             | `PATCH /platform/sip-trunks/{id}`                | `sipTrunks.update`                  |
| `sip-trunk delete`             | `DELETE /platform/sip-trunks/{id}`               | `sipTrunks.delete`                  |
| `sip-trunk rotate-credentials` | `POST /platform/sip-trunks/{id}/credentials`     | `sipTrunks.rotateCredentials`       |
| `calls watch`                  | Lifecycle socket                                 | `CallsClient` events                |
| `calls media`                  | Place or accept, then the media socket           | `CallsClient`, `Call`, `call.audio` |

`sip-trunk endpoint` reads the address with `sipTrunks.endpoint` and checks
the response shape before printing it, so a malformed answer fails instead of
printing a partial address. The human output of `sip-trunk create` and
`sip-trunk rotate-credentials` prints the one-time credentials before looking up
this address. That optional lookup has a five-second deadline and no retries;
a timeout omits the appendix and leaves the successful credential operation's
exit status unchanged. JSON output does not perform the optional lookup.

The CLI uses only the neutral public calling surface. It does not expose
offers, candidates, session descriptions, or media framing, and it imports no
internal SDK module.

## Credential rules

- Server API keys act as `server:<participant>`. `--participant` must match
  `[A-Za-z0-9._:@-]{1,128}`; the API defaults to `default`.
- Client tokens (`POLYMORFA_CLIENT_TOKEN`) act as their own participant. The
  CLI rejects `--participant` with a client token before any request. The API
  enforces client rules (`voip_place`, `voip_answer`, `voip_signal`); the CLI
  reports its errors unchanged.
- `calls place`, `calls watch`, and `calls media` require `--session` with a
  server API key. Client tokens use their bound session. `calls watch` and
  `calls media` reject `--session` with a client token because the socket never
  sends it for client tokens and the CLI cannot prove it matches.
- `calls settings` resolves Platform credentials, so client tokens fail with
  the standard Platform credential error. The SDK exposes the operation on the
  Messaging client; the CLI builds that client from the Platform environment.
  `calls settings set --expected-revision` sends `expectedRevision`; a stale
  revision returns 409 `state_conflict`, which exits with code 4.
- `calls stats` and `calls export` accept an organization API key or an
  exact-project token (`sessions:read`), resolved like the developer
  commands. `--project` (or a project token, which requires it) reads one
  project; an organization key without `--project` reads the whole
  organization. `--owner` still overrides the inferred owner.
- `calls retention` resolves a team API key or a project token
  (`resolveTeamSettingEnvironment`), from the environment or a profile, with
  no project context, and the API decides what each principal may do.
  `createCallRetentionClient` in `src/sdk/client.ts` uses the pinned SDK's
  `createTeamCallRetentionClient` for both credential types. The API lets team
  API keys and project tokens read the setting and only team API keys change
  it; the CLI replaces the API's 403 text with that rule and keeps the API
  message.
- `calls retention set` requires `--expected-revision`. It reads the setting
  (`GET` needs `sessions:read`, which `sessions:manage` does not imply, so the
  command needs both scopes; a 403 on either request gets the change message),
  fails locally with `state_conflict` (exit 4) when the revision differs, asks
  for confirmation when the new period is shorter (`--yes`, or exit 2
  `confirmation_required` without a terminal), then sends `policy`,
  `retentionDays` (only when `--days` is given) and `expectedRevision`. A 409
  from the `PUT` also exits 4 and tells the user to read the setting again.
- Sockets carry the credential in their first frame. The CLI requires an HTTPS
  base URL, or HTTP on a loopback host, before opening any Calls connection.

## Command decisions

- **Two reject commands.** `call reject` stays on the Linked Device session
  route, which needs the session, call ID, and caller ID. `calls reject` is the
  unified API decline. Each command's help names the other.
- **Conflicts.** `call_claimed`, `call_not_ringing`, and `connection_limit`
  get specific messages. They exit with code 4, and `--json` errors include the
  stable `code`. The CLI adds `code` to presented conflict errors generally.
- **No idempotency flags.** The contract defines no idempotency behavior for
  these routes, and the SDK retries keyed POST requests on 409 and 5xx.
  Retrying a placement could place a second call, so the CLI does not offer
  `--idempotency-key`. `calls end` succeeds when repeated.
- **No confirmation for `calls end`.** Ending a call is the explicit purpose
  of the command, like hanging up. Declining with `calls reject` also ends the
  call for everyone; both help texts say so.
- **Validation.** Call targets must match the contract pattern
  `^(?:\+[1-9]\d{1,14}|[1-9][0-9]{0,18})$`. Connection IDs must match
  `^[A-Za-z0-9_-]{8,64}$`. Call IDs must be nonempty. All checks run before
  transport.
- **`calls watch`.** The public `CallsClient` reports inbound calls and their
  claim, state, roster, and end updates; it does not surface calls placed by
  other participants or raw lifecycle frames. The command streams exactly what
  the client reports. A 4401 close, or a 4400 refusal, is terminal: exit code 3
  or 2. Other socket problems are printed as `notice` lines while the SDK
  reconnects. Ctrl-C and `SIGTERM` stop with exit code 0.
- **`calls media`.** The public client creates calls only from placement or
  from a ring it observes, so the command either places a call or waits for an
  inbound ring (optionally a specific call ID). It answers the call, or joins
  it when another participant answered without a claim. Input is paced in real
  time in 20 ms frames because the service buffers only a short window;
  an input underrun restarts the clock instead of causing a burst. Received
  audio is written as little-endian bytes regardless of host byte order.
  Output never goes to a terminal. Ctrl-C leaves, or ends a placed call that is
  still ringing. The CLI cannot choose the connection ID because the public
  client generates it; status output reports it.
- **Runtime.** Socket commands need a global `WebSocket` (Node.js 22 or
  newer). On older runtimes they fail with a configuration error before
  connecting. The CLI as a whole requires Node.js 22 or newer.

- **Call statistics.** Filters and range limits (366 days for `day`, 31 for
  `hour`, IANA `--timezone`) are checked before the request; the API default
  range of 7 days applies when `--since` or `--until` is omitted. Human output
  prints totals, a group table, and, with `--heatmap`, a 7-by-24 grid. `--json`
  prints the standard read envelope with the complete response.
- **Call export.** The command follows `Polymorfa-Next-Cursor` until it is
  absent and writes the CSV header from the first page only; a later page with
  different columns, or a repeated cursor, stops the export with a server
  error. Records go to standard output or `--output`, which is created on the
  first page (even an empty one, so a zero-record export truncates a
  `--force` target) and refused when it exists unless `--force`. Progress, the
  summary, and resume cursors go to standard error only (JSON lines with
  `--json`). `--cursor` is sent with the filters because the API expects the
  same filters on every page. A failed page keeps earlier records, reports
  the cursor for the failed page, and exits with the API error's exit code.
- **SDK publication gate.** `src/services/call-analytics.ts` uses typed
  `calls.stats` and `calls.export`. The published SDK pin in `package.json`
  predates those methods. Verify this branch with the local SDK package until
  the exact analytics SDK revision is published, then pin that version before
  merging the CLI change.

## Explicit gaps

- No call list or retrieve command. `GET /platform/calls` exists; `calls
export --format ndjson` covers the same records for scripts.
- `calls media` does not attach to a call that was already ringing or answered
  before it started, and carries no video.
- `calls watch` does not report outbound calls placed by other participants.
- `@polymorfa/sdk` (with its `@polymorfa/sdk/calls` subpath) is published to
  npm only as dev prereleases; the CLI pins exactly
  `0.1.0-dev.20260922115749`. The CLI cannot release until a stable
  `@polymorfa/sdk` is published with a compatible semver range.

The optional SIP address appendix respects a shorter global `--timeout`; its
five-second abort signal is an upper bound, not a per-request timeout override.
