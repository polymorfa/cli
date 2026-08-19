# Quick Replies command research

- **Status:** Complete Messaging Quick Replies implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `aad860c31bd71fa628df9b6fca68339c64c64ace`

## Sources reviewed

- [Whatomate](https://github.com/shridarpatil/whatomate), an open-source
  WhatsApp integration that presents stored quick replies as canned responses.
- Current open-source WhatsApp CLIs reviewed for the earlier message, group,
  media, and label slices.
- The pinned Polymorfa Messaging Quick Replies contract and public TypeScript
  SDK.

Whatomate confirms the user-facing distinction between stored canned responses
and interactive quick-reply buttons, but its CLI starts services rather than
managing that resource. No reviewed CLI establishes a stronger CRUD grammar.
Polymorfa therefore uses the repository's singular-resource convention and the
exact source semantics: `quick-reply list`, create, replace, and delete.

## Shipped contract

```text
polymorfa quick-reply list --session <session>
polymorfa quick-reply create --session <session> --shortcut <shortcut> --message <message> [--keyword <keyword>...] [--count <count>]
polymorfa quick-reply replace <quick-reply> --session <session> --shortcut <shortcut> --message <message> [--keyword <keyword>...] [--count <count>]
polymorfa quick-reply delete <quick-reply> --session <session> --yes
```

- Every command uses `MessagingClient.quickReplies`, requires a server API key,
  and rejects browser client tokens before transport.
- List requires `profile:read`. Create, replace, and delete require
  `profile:write` and accept `--idempotency-key`.
- List preserves the complete source observation envelope: policy, status,
  optional unknown reason and observation time, and observed quick replies.
- Session and quick-reply identifiers remain opaque and are encoded by the SDK.
- `--keyword` is repeatable. Shortcut and message are required for create and
  replace; optional keywords and count are omitted when the user does not
  supply them.
- Replace is deliberately not named update. The source `PUT` accepts the
  complete mutation representation, so the command requires both shortcut and
  message rather than sending a partial patch.
- Delete requires `--yes`; this development slice does not claim an interactive
  confirmation prompt.
- Human output is compact. `--json` preserves resource data and SDK response
  metadata, and `--quiet` suppresses successful output.

## Errors and recovery

A client-token profile fails locally with guidance to select a server-key
profile. Missing session, shortcut, message, identifier, or deletion
confirmation fails through the shared usage-error path before transport.
Request failures retain SDK categories and request IDs. A caller can retry a
mutation with the same explicit idempotency key.

## Source gaps and coverage

The source exposes no retrieve-by-ID, send, sync, history, search, or pagination
route. The CLI does not synthesize those commands and does not use `raw.request`
to cross the client-token boundary. `quickReplyMode` belongs to observation
policy responses and is not accepted by this resource; the public OpenAPI
request schemas do not document it as an update field.

The SDK slice moved four operations from missing to covered, producing 331
total / 134 covered / 134 missing / 63 excluded / 0 partial / 0 changed. This
CLI slice adds curated commands for all four covered Quick Replies operations.
