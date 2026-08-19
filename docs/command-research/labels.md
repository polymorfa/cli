# Labels command research

- **Status:** Complete Messaging Labels implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `87dcf28624742dfe4cab27dab165a26de142b151`

## Sources reviewed

- [GitHub CLI label commands](https://cli.github.com/manual/gh_label)
- [GitHub CLI label reference](https://cli.github.com/manual/gh_help_reference)
- Current open-source WhatsApp CLIs reviewed for earlier message, group, and
  media slices; none exposes a comparable session label contract.
- The pinned Polymorfa Messaging Labels contract and public TypeScript SDK.

GitHub CLI validates the familiar label CRUD grammar and requires explicit
confirmation for deletion. Polymorfa uses that convention while adding an
explicit session boundary and a separate chat-assignment topic. Existing
WhatsApp CLIs do not provide a useful precedent for full-set replacement, so
the exact Polymorfa source semantics control that workflow.

## Shipped contract

```text
polymorfa label list --session <session> [--include-observation]
polymorfa label create --session <session> --name <name> [--color <index>]
polymorfa label update <label> --session <session> [--name <name>] [--color <index>]
polymorfa label delete <label> --session <session> --yes
polymorfa label chat list <chat> --session <session> [--include-observation]
polymorfa label chat replace <chat> --session <session> (--label <id>... | --clear)
```

- Every command uses `MessagingClient.labels`, requires a server API key, and
  rejects client tokens before transport.
- Reads preserve the source's legacy label array or, when explicitly
  requested, the typed observation-policy and freshness envelope.
- Label and chat identifiers are opaque and encoded by the SDK. Lists are
  unpaged because the source exposes no pagination contract.
- Create, update, delete, and chat replacement accept an idempotency key.
- Update rejects an empty patch locally because the SDK and source require a
  name or color.
- Delete requires `--yes`; this slice does not pretend an interactive prompt
  exists yet.
- Chat replacement is deliberately named `replace`. Repeat `--label` to supply
  the complete desired set, or pass `--clear` to send the exact empty set. The
  two forms are mutually exclusive, and omission is an error.

## Source gaps and deferred policy commands

There is no incremental attach/detach route, message-label operation, or label
pagination. The observation-policy resource is typed but remains a separate
future command family because changing presence, typing, and label observation
has broader retention and event-delivery consequences than label CRUD.
