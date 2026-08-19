# Profile command research

- **Status:** Complete Messaging Profile implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `294534203bcf3ec09ed54481f979797ea6222aaa`

## Sources reviewed

- [WuzAPI API reference](https://github.com/asternic/wuzapi/blob/main/API.md),
  which separates account and contact/profile operations but does not establish
  a resource-management CLI grammar.
- [whatsmeow user operations](https://github.com/tulir/whatsmeow/blob/main/user.go),
  including profile-picture retrieval behavior and profile-specific errors.
- [GitHub CLI repository guidance](https://github.com/cli/cli), for discoverable
  noun/subresource command grouping and consistent machine output.
- The pinned Polymorfa Messaging Profile contract, runner behavior, and public
  TypeScript SDK.

The reviewed WhatsApp projects expose profile behavior primarily through APIs
or libraries. Polymorfa therefore follows its existing nested-resource grammar:
`profile view`, `profile name set`, `profile status set`, and `profile picture
set|delete`.

## Shipped contract

```text
polymorfa profile view --session <session>
polymorfa profile name set --session <session> --name <name>
polymorfa profile status set --session <session> --status <status>
polymorfa profile picture set --session <session> (--file <path> | --url <url>)
polymorfa profile picture delete --session <session> --yes
```

- Every command uses `MessagingClient.profile`, requires a server API key, and
  rejects browser client tokens before transport.
- View requires `profile:read`. The four mutations require `profile:write` and
  accept `--idempotency-key`.
- Session identifiers are opaque and encoded by the SDK.
- Name rejects an empty value before transport. Status is sent as supplied
  because an empty status is not prohibited by the public contract.
- Picture input is the source API's JSON representation. `--url` sends the URL
  for service-side retrieval. `--file` reads a local file, enforces the verified
  50 MiB service limit before and after reading, and sends its base64 encoding.
- The curated command requires exactly one picture source even though the
  public request type makes both fields optional. This avoids an ambiguous
  request and the live runner's base64-over-URL precedence when both are sent.
  The raw API escape hatch remains available for contract-level experiments.
- Picture deletion requires `--yes`; no interactive confirmation is claimed in
  this development slice.
- `--json` preserves resource data and SDK response metadata. Mutations retain
  the full response envelope so live operation-specific payloads are not lost.

## Response compatibility

The pinned public OpenAPI describes profile data as `name`, `status`, and an
optional picture URL. The pinned live handler returns account fields including
push name, platform, business name, optional JID, and optional picture URL. The
published mutation responses are generic success objects, while the live
handler also returns operation-specific data.

The SDK follows the public contract without runtime transformation. The CLI's
JSON mode therefore preserves the actual response. Human profile rendering
recognizes both known shapes and does not assume fields the live response does
not provide. This compatibility handling can be simplified after the API
description and handler agree.

## Errors, recovery, and source gaps

Missing session, name, status, picture source, or deletion confirmation fails
locally. Two picture sources are rejected before file I/O or transport. A local
file over 52,428,800 bytes is rejected without loading it into memory. Request
failures retain SDK categories and request IDs, and mutations can be retried
with the same idempotency key.

The source exposes no profile history, picture retrieval/download, multipart
or binary upload, streaming, pagination, or profile-specific client-token
action. The CLI does not synthesize those operations.

The SDK slice moved five operations from missing to covered, producing 331
total / 139 covered / 129 missing / 63 excluded / 0 partial / 0 changed. This
CLI slice adds curated commands for all five covered Profile operations.
