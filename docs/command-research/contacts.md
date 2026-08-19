# Contacts command research

- **Status:** Complete Messaging Contacts implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `6afb40b3e354eea57d9ce45257ed93a0cc8a8f41`

## Sources reviewed

- [whatsmeow user operations](https://github.com/tulir/whatsmeow/blob/main/user.go),
  including registration checks, business profiles, linked devices,
  blocklist retrieval, and blocklist updates.
- [WuzAPI API reference](https://github.com/asternic/wuzapi/blob/main/API.md),
  including contact listing and block/unblock REST presentation.
- The pinned Polymorfa Contacts contract, runner behavior, and public
  TypeScript SDK.

The source exposes several related but distinct contact views. The CLI names
each operation directly rather than presenting all of them as one ambiguous
`view` command.

## Shipped command tree

```text
contact
  list
  check --phone <number>...
  view <contact>
  picture <contact>
  info <contact>
  devices <contact>
  business-profile <contact>
  blocklist
  block <contact>
  unblock <contact>
```

All ten operations require an active Linked Device session and a server API
key. Reads require `contacts:read`; block and unblock require
`contacts:manage`. No Contacts route appears in the browser client-token action
allowlist, so the CLI rejects client tokens before transport. Session and
contact identifiers are encoded by the SDK.

## Data-source and output semantics

`contact list` returns all contacts known to the connected session. `contact
view` retrieves one of those stored contact records by LID. Neither claims a
fresh remote lookup. Lists are complete unpaged arrays because the source has
no cursor or pagination fields.

`contact check` accepts one or more repeatable phone flags, preserves their
order, and submits one SDK registration query. Results distinguish registered
and unregistered numbers and preserve optional LID, canonical ID, username,
and phone-number values under JSON.

`contact info` is the explicitly live WhatsApp user-metadata operation. It
preserves JID/LID identity, status, picture ID, verified name, and linked-device
JIDs. `contact devices` returns the upstream JID strings directly rather than
inventing a local device model.

`contact picture` returns a profile-picture URL. It does not download, stream,
cache, or write image bytes. `contact business-profile` preserves the complete
typed profile including address, email, description, websites, cover photo ID,
categories, options, time zone, and business hours.

`contact blocklist` preserves both the list hash and blocked JIDs. Block and
unblock are reversible POST actions rather than destructive deletes, so they do
not add a redundant confirmation flag. Both accept `--idempotency-key`, and JSON
output preserves the full success response plus SDK metadata.

## Explicit gaps

The pinned Contacts tag exposes no contact create, update, delete, search,
history, pagination, picture download, device management, business-profile
mutation, or bulk block/unblock route. The CLI does not derive search from a
full client-side contact scan and does not cross the client-token boundary with
raw requests.

Contacts remain ten covered operations in the SDK ledger. At the exact CLI
baseline, the overall ledger records 331 total / 181 covered / 87 missing / 63
excluded / 0 partial / 0 changed operations.
