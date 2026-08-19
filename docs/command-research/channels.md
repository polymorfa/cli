# Channels command research

- **Status:** Complete Messaging Channels implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `79730b9ccc04339f7e28d8dd0f216af43758ca9e`

## Sources reviewed

- [whatsmeow newsletter implementation](https://github.com/tulir/whatsmeow/blob/main/newsletter.go),
  which implements channel metadata, creation, follow state, mute state,
  message actions, and temporary live-update subscription under the protocol's
  newsletter terminology.
- [whatsmeow newsletter events](https://github.com/tulir/whatsmeow/blob/main/types/events/events.go),
  which distinguishes join, leave, mute-change, and live-update events.
- [WuzAPI API reference](https://github.com/asternic/wuzapi/blob/main/API.md),
  reviewed for REST presentation and event-delivery precedent.
- The pinned Polymorfa Channels contract, runner behavior, and public
  TypeScript SDK.

Polymorfa retains the public API's `channel` vocabulary. It does not expose the
protocol name `newsletter` as a second alias, or merge channels with chats and
groups.

## Shipped command tree

```text
channel
  list
  view <channel>
  create
  delete <channel> --yes
  message
    list <channel>
    updates <channel>
    mark-viewed <channel> <server-id>
    react <channel> <server-id>
  live-updates
    subscribe <channel>
  follow <channel>
  unfollow <channel>
  mute <channel>
  unmute <channel>
```

All commands require an active Linked Device session and a server API key.
Reads and live-update subscription require `channels:read`; every other
operation requires `channels:manage`. Browser client tokens are rejected before
transport. Session, channel, and numeric message identifiers are encoded by the
SDK.

Mutations accept `--idempotency-key`. Permanent channel deletion additionally
requires `--yes`. Creation requires a non-empty name and accepts an optional
description. It deliberately omits a picture flag because the pinned public
request and runner use different field names, so the published picture input is
not applied.

## Message history and actions

`channel message list` maps `--limit` to `count` and `--before` to the positive
numeric server-ID boundary. `channel message updates` adds Unix-seconds
`--since` and positive server-ID `--after`. Both limits accept 1 through 100 and
default at the API to 50 when omitted. The service returns bare bounded arrays:
there is no cursor, next page, `hasMore`, or automatic pagination contract.
The runner treats `--since 0` as unset. Update rows may omit text while retaining
view and reaction counters.

`channel message mark-viewed` accepts a positive safe integer. This increases
the upstream view count and is distinct from synchronizing read state to other
devices. Reaction text is checked against the runner's stricter 32 UTF-8 byte
limit. An explicitly empty reaction is preserved and removes the caller's
reaction.

## Temporary subscriptions and response compatibility

`channel live-updates subscribe` performs one mutation and displays the returned
duration in seconds. It does not claim to stream, listen, poll, or maintain a
socket. Repeating it renews the temporary upstream subscription. The source has
no unsubscribe operation; callers can query bounded message updates while a
subscription is active.

Several action routes publish generic success responses while the live runner
returns `FOLLOWED`, `UNFOLLOWED`, `MUTED`, `UNMUTED`, `VIEWED`, or `UPDATED`
data, and can return an async request ID. JSON output preserves the complete
actual envelope. Creation, deletion, and subscription likewise preserve their
typed data or async request identifier without inventing synchronous status.

The source has no dedicated channel-send or metadata-update route. Message
sending to a channel must use an exact supported Messages request rather than a
fabricated Channels endpoint. The CLI adds no history beyond the two bounded
list operations and no watch/listener/unsubscribe commands.

The SDK slice records 331 total / 156 covered / 112 missing / 63 excluded / 0
partial / 0 changed operations. This CLI slice exposes all 13 typed Channels
operations.
