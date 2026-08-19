# Groups command research

- **Status:** Initial read-oriented implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `b6a808366e84eb049c396a524b563ac600284826`

## Sources reviewed

- [eddmann/whatsapp-cli group commands](https://github.com/eddmann/whatsapp-cli)
- [wu-cli group commands](https://github.com/ibrahimhajjaj/wu-cli)
- [steipete/wacli group commands](https://github.com/steipete/wacli)
- [WhatsMeow group implementation](https://github.com/tulir/whatsmeow/blob/main/group.go)
- The pinned Polymorfa Messaging Groups contract and public TypeScript SDK.

Existing CLIs converge on list, info, participants, invite, join, leave, and
rename workflows. Most own one local WhatsApp database or connection and can
hide device selection. Polymorfa can own many sessions, so the initial commands
require `--session <id>` rather than guessing.

## Initial read contract

```text
polymorfa group list --session <session>
polymorfa group view <group> --session <session>
polymorfa group participants list <group> --session <session>
polymorfa group invite-link <group> --session <session>
```

- Commands use `MessagingClient.groups`; they never call raw routes.
- Groups require a server API key. The CLI rejects Messaging browser client
  tokens locally before sending a request.
- The API exposes complete unpaged arrays, so `--limit`, `--cursor`, and
  `--paginate` are not advertised.
- `--json` returns stable resource data plus SDK response metadata. Human output
  uses concise tables or summaries. `--quiet` follows the current global
  contract and suppresses successful output.
- Invite output contains both the source code and its derived
  `https://chat.whatsapp.com/<code>` URL.
- Group and participant identifiers are treated as opaque values and remain
  encoded by the SDK.

## Deferred mutations

Create, leave/delete, join, invite-code revoke, participant changes, subject,
description, picture, and permissions will be implemented in a separate slice.
That research must define confirmation boundaries, repeatable participant
input, idempotency keys, partial failure presentation, and the source
distinction that `DELETE` is a leave alias rather than remote group deletion.
