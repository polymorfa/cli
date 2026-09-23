# Calls, LIDs, and Users command research

- **Status:** Complete three-operation Messaging implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `3324a1d5ae840ed96d1a5f987880587cab2312fb`

## Sources reviewed

- [whatsmeow call handling](https://github.com/tulir/whatsmeow/blob/main/call.go),
  including the exact incoming caller and call-ID inputs to `RejectCall`.
- [whatsmeow user operations](https://github.com/tulir/whatsmeow/blob/main/user.go),
  including LID and device identity handling.
- [whatsmeow package reference](https://pkg.go.dev/go.mau.fi/whatsmeow),
  confirming Linked Device user operations rather than a general identity
  directory.
- The pinned Polymorfa Calls, LIDs, and Users contracts, live runner behavior,
  and public TypeScript SDK.

## Shipped command tree

```text
call
  reject <call> --from <caller-jid>

lid
  resolve (--phone-number <number> | --id <digits@lid> |
           --lid <digits@lid> | --username <name> [--username-key <dddd>])

user
  security-code <digits@lid>
```

All commands require an organization/server API key, an active Linked Device
session, and encoded identifiers. Project credentials, browser client tokens,
Cloud API sessions, dashboard sessions, and staff identities are rejected. Call
rejection requires `chats:manage`; LID resolution and security-code lookup
require `contacts:read`.

## Command decisions

Call rejection is a reversible interaction response rather than deletion, so
it does not require `--yes`. It accepts `--idempotency-key`; the SDK retries its
POST only when the key is nonempty. JSON output preserves the OpenAPI generic
success response, the live synchronous `REJECTED` data, or the asynchronous
request ID without assuming one shape. The CLI validates the 1..128 character
call ID and nonempty caller JID locally.

LID resolution exposes one command with mutually exclusive identity flags. It
trims and validates phone numbers, requires `digits@lid` for stable IDs, keeps
the source's deprecated `--lid` alias visible, enforces usernames at 3..35
characters, and accepts only a four-digit username key. The key cannot be used
without a username. There is no bulk mode or pagination to imply.

Security-code lookup is deliberately singular and requires `digits@lid`. Human
output includes the 60-digit numeric verification code but omits the potentially
large base64 display QR. JSON output preserves that display QR and the SDK
metadata, including the API's `Cache-Control: private, no-store` response
header. The service intentionally excludes WhatsApp's private verification QR
payload.

## Explicit gaps

The unified Calls API is a separate surface with its own command family,
`calls`; see [calls.md](calls.md). `call reject` remains the Linked Device
session route and its help text points to `calls reject`.

The session route exposes no call list, retrieve, accept, placement, history,
watch, or stream operation. It exposes no bulk LID resolution, identity directory, search,
pagination, or retained mapping history. It exposes no security-code list,
cache, history, refresh, verification submission, or private QR operation. The
CLI does not invent these workflows or cross credential boundaries with raw
requests.

At this exact baseline the SDK ledger records 331 total / 184 covered / 84
missing / 63 excluded / 0 partial / 0 changed operations.
