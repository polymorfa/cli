# Calls command research

- **Status:** Implemented against Calls contract revision 1, unpublished
- **Reviewed:** 2026-09-17
- **SDK baseline:** `@polymorfa/sdk` (including the `@polymorfa/sdk/calls`
  subpath) `0.1.0-dev.20260922102711` from npm. The research was done against
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
- `MessagingClient.voip` and the public `@polymorfa/sdk/calls` entry point
  (`CallsClient`, `Call`, and the Calls error classes).

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
| `sip-trunk endpoint`           | `GET /platform/sip/endpoint`                     | `raw.request` (see below)           |
| `sip-trunk list`               | `GET /platform/sip-trunks`                       | `sipTrunks.list`                    |
| `sip-trunk view`               | `GET /platform/sip-trunks/{id}`                  | `sipTrunks.retrieve`                |
| `sip-trunk create`             | `POST /platform/sip-trunks`                      | `sipTrunks.create`                  |
| `sip-trunk update`             | `PATCH /platform/sip-trunks/{id}`                | `sipTrunks.update`                  |
| `sip-trunk delete`             | `DELETE /platform/sip-trunks/{id}`               | `sipTrunks.delete`                  |
| `sip-trunk rotate-credentials` | `POST /platform/sip-trunks/{id}/credentials`     | `sipTrunks.rotateCredentials`       |
| `calls watch`                  | Lifecycle socket                                 | `CallsClient` events                |
| `calls media`                  | Place or accept, then the media socket           | `CallsClient`, `Call`, `call.audio` |

The pinned SDK has no `sipTrunks.endpoint` yet, so `sip-trunk endpoint` reads
`GET /platform/sip/endpoint` through the SDK raw client and validates the
response itself. Switch it to `sipTrunks.endpoint` once an SDK release with that
method is pinned.

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

## Explicit gaps

- No call list, retrieve, or history command: the public contract has no such
  customer operation.
- `calls media` does not attach to a call that was already ringing or answered
  before it started, and carries no video.
- `calls watch` does not report outbound calls placed by other participants.
- `@polymorfa/sdk` (with its `@polymorfa/sdk/calls` subpath) is published to
  npm only as dev prereleases; the CLI pins exactly
  `0.1.0-dev.20260922102711`. The CLI cannot release until a stable
  `@polymorfa/sdk` is published with a compatible semver range.
