# Media command research

- **Status:** Complete Messaging Media implementation slice
- **Reviewed:** 2026-08-19
- **SDK baseline:** `873fb817e4967f8c1d032fb73216774c64ec21f5`

## Sources reviewed

- [wacli media safety and download behavior](https://github.com/steipete/wacli)
- [eddmann/whatsapp-cli download command](https://github.com/eddmann/whatsapp-cli)
- [vicentereig/whatsapp-cli media download](https://github.com/vicentereig/whatsapp-cli)
- [GitHub CLI release download](https://cli.github.com/manual/gh_release_download)
- The pinned Polymorfa Messaging Media contract and public TypeScript SDK.

Existing CLIs expose explicit download destinations and small machine-readable
receipts instead of printing binary content. Current wacli hardens media reads
with a 100 MiB limit. Polymorfa adopts those useful safety properties while
retaining the exact server distinction between local download and remote object
storage persistence.

## Shipped contract

```text
polymorfa media view <media>
polymorfa media download <media> --output <path> [--max-bytes <bytes>] [--force]
polymorfa media persist <media> [--idempotency-key <key>]
```

- All commands use the distinct `MessagingClient.media` resource and require a
  server API key. Client tokens are rejected before transport.
- Media IDs are opaque and encoded by the SDK. No session flag is synthesized
  because the source routes address a credential-scoped media ID directly.
- `media download` refuses implicit destinations and overwrites. It resolves
  the explicit destination to an absolute path and returns that path, byte
  count, media ID, MIME type, and SDK response metadata.
- The command retrieves metadata before download and rejects declared files
  larger than 100 MiB by default. `--max-bytes` is an explicit override, and
  the actual buffered response is checked again before it is written.
- The SDK follows redirects and buffers the complete body. The CLI does not
  claim streaming, range reads, or constant-memory behavior.
- `media persist` is named for its server-side effect and accepts an
  idempotency key. It does not download locally.

## Source gaps

The pinned Messaging API exposes no upload, delete, list, resumable upload,
range download, or streaming-response contract. Message send URL/base64 fields
are send inputs rather than uploads. Those unsupported operations remain absent
from the CLI and must not be routed through the unrelated Platform media
resource.
