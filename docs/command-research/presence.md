# Presence command research

- **Status:** Complete Messaging Presence implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `e9c83a9c298e0b0f335b9c5ad953a4627dcefeb4`

## Sources reviewed

- [WuzAPI API reference](https://github.com/asternic/wuzapi/blob/main/API.md),
  which distinguishes sending account presence, subscribing to a chat, and
  receiving subsequent presence events.
- [whatsmeow presence implementation](https://github.com/tulir/whatsmeow/blob/main/presence.go),
  including self-presence sending and subscription behavior.
- [whatsmeow presence events](https://github.com/tulir/whatsmeow/blob/main/types/events/events.go),
  which keeps user availability and chat composing/paused observations
  distinct.
- The pinned Polymorfa Messaging Presence contract, runner behavior, and public
  TypeScript SDK.

The reviewed projects model presence as a transient observation workflow, not
as a durable resource list. Polymorfa therefore uses explicit self-state and
chat-observation commands and does not describe retained state as a live query.

## Shipped contract

```text
polymorfa presence view --session <session>
polymorfa presence set --session <session> --state <available|unavailable>
polymorfa presence chat view <chat> --session <session>
polymorfa presence chat subscribe <user-or-lid> --session <session>
```

- Every command uses `MessagingClient.presence`; no raw HTTP transport is
  duplicated in the CLI.
- Self view needs `presence:read`. Chat view needs `presence:read` for a server
  key or `read_presence` for a client token. Subscription needs
  `presence:observe` or the client-token `subscribe_presence` action.
- Changing self presence needs a server API key with `presence:write`. The CLI
  rejects a client token before transport.
- `presence set` validates against the SDK-exported `PRESENCE_STATES` constant
  and accepts `--idempotency-key`.
- Session and chat identifiers are encoded by the SDK.
- JSON output retains typed resource data, actual response envelopes where the
  source contract varies, and SDK response metadata including request IDs.

## Observation and renewal semantics

`presence view` returns the runner's remembered desired state and last
successfully sent state. Its `authoritative` field is always false. Human output
labels that property directly and never calls the result live account state.

`presence chat view` returns a policy-governed retained projection. Human output
shows the observation policy, fresh/unknown/stale status, optional unknown
reason, availability, timestamps, subscription expiry, and staleness. Typing
policy and observation status are rendered separately from availability, and a
retained composing/paused chat state remains distinct from the outbound
`message typing` action.

`presence chat subscribe` creates or renews the upstream observation request
and prints the returned expiry. Repeating the same command renews it. The CLI
does not hard-code runner capacity, request-rate, renewal, or suspension limits;
callers rely on the returned expiry and typed API errors.

## Response discrepancies and source gaps

The published self-state mutation response is generic success, while the live
handler can return `{data: {status: "OK"}}` and the documented async accepted
envelope. The CLI preserves the complete actual envelope in JSON. Subscription
can similarly return subscription data or an async request ID.

The source exposes no streaming watch, history, polling helper, unsubscribe,
authoritative remote self-presence query, or live-query bypass for observation
policy. Subscription accepts non-device user or LID JIDs; chat observation also
accepts group JIDs. Those source constraints remain API validation rather than
a duplicated CLI JID parser.

The SDK slice records 331 total / 143 covered / 125 missing / 63 excluded / 0
partial / 0 changed operations. This CLI slice adds curated commands for all
four typed Presence methods.
