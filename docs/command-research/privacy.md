# Privacy command research

- **Status:** Complete Messaging Privacy implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `b6ed98fe973123bf5f233b5a452214e25374f588`

## Sources reviewed

- [WuzAPI privacy reference](https://github.com/asternic/wuzapi/blob/main/API.md),
  which documents setting-specific values instead of treating privacy as an
  unconstrained string pair.
- [whatsmeow disappearing-timer implementation](https://github.com/tulir/whatsmeow/blob/main/send.go),
  including the standard off, 24-hour, 7-day, and 90-day durations.
- [whatsmeow privacy events](https://github.com/tulir/whatsmeow/blob/main/types/events/events.go),
  which keeps privacy changes distinct from profile and chat events.
- The pinned Polymorfa Messaging Privacy contract, runner behavior, and public
  TypeScript SDK.

The current OSS behavior supports explicit setting/value validation and
human-readable timer choices. Polymorfa uses `privacy view`, `privacy set`, and
the separate `privacy disappearing-timer set` account-default workflow.

## Shipped contract

```text
polymorfa privacy view --session <session>
polymorfa privacy set --session <session> --setting <setting> --value <value>
polymorfa privacy disappearing-timer set --session <session> --duration <off|24h|7d|90d>
```

- Every command uses `MessagingClient.privacy`, requires a server API key, and
  rejects browser client tokens before transport.
- View requires `profile:read`. Both mutations require `profile:write` and
  accept `--idempotency-key`.
- Session and setting path segments are encoded by the SDK.
- `privacy set` validates directly against the SDK's exported
  `PRIVACY_SETTING_VALUES`; the CLI does not maintain a second validation
  matrix.
- `privacy view` renders the canonical API setting names in human mode and
  preserves typed data plus response metadata under `--json`.
- Account-default duration choices map to exact API seconds: `off` to `0`,
  `24h` to `86400`, `7d` to `604800`, and `90d` to `7776000`.
- The account default is deliberately not presented as a per-chat mutation.
  Per-chat disappearing timers belong to the separate Chats source route.
- The timer command preserves the complete live response envelope under JSON
  because the live service returns operation data beyond the published generic
  success shape.

## Setting and value matrix

```text
groupadd       all | contacts | contact_blacklist | none
last           all | contacts | contact_blacklist | none
status         all | contacts | contact_blacklist | none
profile        all | contacts | contact_blacklist | none
readreceipts   all | none
online         all | match_last_seen
calladd        all | known
messages       all | contacts
defense        on_standard | off
stickers       contacts | contact_allowlist | none
```

An unknown setting fails locally and lists supported settings. A value that is
invalid for the selected setting fails locally and lists only that setting's
allowed values. Request failures retain SDK categories and request IDs, and a
mutation can be retried with its original idempotency key.

## Source discrepancies and gaps

The public request schema describes one aggregate value enum independently of
the setting path, while the live runner enforces the stricter matrix above. The
SDK exposes that verified matrix as a runtime constant and a discriminated
union. Privacy reads and setting mutations match their published envelopes.
The account-default timer mutation returns `{status: "UPDATED"}` as live data
although its public response type is generic success; the CLI does not assume a
message exists.

The source exposes no privacy history, value-list endpoint, pagination,
allowlist/blacklist member management, or other Privacy route. The CLI does not
use raw requests to cross the client-token boundary.

The SDK slice moved three operations from missing to covered, producing 331
total / 142 covered / 126 missing / 63 excluded / 0 partial / 0 changed. This
CLI slice adds curated commands for all three covered Privacy operations.
