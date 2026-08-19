# Messages command research

- **Status:** Initial text-send and action implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `b9f9445390a35ba6582bf63dac1bbf65a24ff502`

## Sources reviewed

- [eddmann/whatsapp-cli send and react commands](https://github.com/eddmann/whatsapp-cli)
- [wu-cli message commands](https://github.com/ibrahimhajjaj/wu-cli)
- [wacli send commands](https://github.com/steipete/wacli)
- The pinned Polymorfa Messaging Messages contract and public TypeScript SDK.

Existing CLIs converge on a recipient-first send workflow, a distinct reaction
verb, reply context on send, and machine-readable output. Some expose local
history, search, and forward commands because they own a device database.
Polymorfa does not infer those capabilities: its pinned server contract has one
send route and no message history, list, search, or standalone reply/forward
operation.

## Initial contract

```text
polymorfa message send text --session <session> --to <recipient> --body <text>
polymorfa message react <message> --session <session> --chat <chat> --emoji <emoji>
polymorfa message mark-seen <message> --session <session> --chat <chat>
polymorfa message typing --session <session> --chat <chat> --state <state>
polymorfa message star <message> --session <session> --chat <chat> [--remove]
```

- Commands use `MessagingClient.messages`; they never call raw routes.
- Session selection remains explicit until linked session context exists.
- `message send text` requires text even though the generic API schema makes
  that field optional across the shared send route.
- `--reply-to` and `--reply-participant` are paired because the exact quoted
  message contract requires both values. `--forwarded` and repeatable
  `--mention` map directly onto the same send body.
- Every operation accepts `--idempotency-key`; JSON output includes complete
  response data and SDK response metadata.
- `message typing --state` accepts only `typing`, `recording`, or `paused`.
- `message star --remove` maps to `star: false`; omission maps to `star: true`.
- Server API keys require `messages:write`. Client-token eligibility is
  enforced by the API's live per-action recipient and rate-limit rules, so the
  CLI does not claim that credential possession alone authorizes a send.

## Deferred send kinds and adjacent chat actions

Media, template, location, contact, poll, product, list, buttons, address, and
flow sends need focused flag and file-input research before implementation.
They will remain typed subcommands rather than a generic `--payload` escape
hatch. Message edit and delete remain backed by the separate Chats resource and
need their own destructive-action and confirmation design. Unsupported
history/search commands remain absent rather than falling through to raw API
calls.
