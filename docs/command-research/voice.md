# Voice Automation command research

- **Status:** Implemented against contract revision `voice-audio-v1`,
  unpublished, beta (`calls.voice-automation`)
- **Reviewed:** 2026-09-19
- **API contract:** polymorfa/polymorfa draft PR #227, branch
  `t3code/voice-audio-library`, revision `voice-audio-v1`
- **SDK reference:** `client.voice` in polymorfa/sdks draft PR #279 at
  `8c61d642da51e14290ae916cd342f71cc0bf94e6`
- **SDK pin:** `@polymorfa/sdk@0.1.0-dev.20260922102711`, inherited from
  CLI `dev` (see
  [SDK dependency](#sdk-dependency))

## Sources reviewed

- The voice audio library and provider credential contract, revision
  `voice-audio-v1`: routes, schemas, closed enums, error codes and webhook
  events.
- Design section 18.2 (CLI) of the Voice Automation specification: command
  tree, key input rule, and distinct exit codes for `gate_limit_reached` and
  `voice_not_enabled`.
- `packages/typescript/src/platform/voice.ts` and the upload URL transport in
  polymorfa/sdks `8c61d64`.

## Command tree

```text
voice
  audio
    upload <file> --name --project [--retention-days] [--wait] [--wait-timeout]
    tts --name (--text | --text-file) --provider elevenlabs|openai --voice
        [--model] [--credential] [--retention-days] --project [--wait]
    list --project [--status] [--limit] [--cursor]
    view <asset>
    update <asset> [--name] [--retention-days <n|none>] [--expected-revision]
    delete <asset> [--yes]
    preview <asset> [--output <file>] [--force]
  credential
    add --provider --label [--project] [--key-env]
    list [--project]
    view <credential>
    verify <credential>
    delete <credential> [--yes]
```

Campaigns, flows, agents, usage and gates (design section 18.2) belong to later
Voice Automation phases and are not part of this revision.

## Operation mapping

| Command                   | Operation                                                  | SDK `client.voice` (8c61d64)   |
| ------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `voice audio upload`      | `POST /platform/voice/audio`, upload URL, `.../complete`   | `audio.upload`                 |
| `voice audio tts`         | `POST /platform/voice/audio/tts`                           | `audio.synthesize`             |
| `voice audio list`        | `GET /platform/voice/audio`                                | `audio.list`                   |
| `voice audio view`        | `GET /platform/voice/audio/{id}`                           | `audio.retrieve`               |
| `voice audio update`      | `PATCH /platform/voice/audio/{id}`                         | `audio.update`                 |
| `voice audio delete`      | `DELETE /platform/voice/audio/{id}`                        | `audio.delete`                 |
| `voice audio preview`     | `GET /platform/voice/audio/{id}/preview`                   | `audio.previewUrl`             |
| `--wait`                  | `GET /platform/voice/audio/{id}` until `ready` or `failed` | `audio.retrieve`               |
| `voice credential add`    | `POST /platform/voice/provider-credentials`                | `providerCredentials.create`   |
| `voice credential list`   | `GET /platform/voice/provider-credentials`                 | `providerCredentials.list`     |
| `voice credential view`   | `GET /platform/voice/provider-credentials/{id}`            | `providerCredentials.retrieve` |
| `voice credential verify` | `POST /platform/voice/provider-credentials/{id}/verify`    | `providerCredentials.verify`   |
| `voice credential delete` | `DELETE /platform/voice/provider-credentials/{id}`         | `providerCredentials.delete`   |

## SDK dependency

The committed npm pin, `0.1.0-dev.20260922102711`, predates `client.voice`.
This branch uses the typed resource from SDK PR #279 and was verified with a
temporary local package. API PR #227 and SDK PR #279 must merge before this CLI
PR can pin the exact published SDK prerelease. No local package path belongs in
the committed manifest or lockfile.

`src/sdk/voice.ts` calls the typed audio and provider-credential resources.
The SDK handles upload URL transfer without the API credential. The SDK does
not expose a preview download method, so the CLI downloads the signed preview
URL itself with no credential, no redirects, a bounded response, and a timeout.

## Credential rules

- The commands resolve Platform credentials: an organization server API key
  (`POLYMORFA_API_KEY` or an API-key profile). Client tokens fail before any
  request. The API also accepts project tokens; the CLI does not use them for
  these commands, matching `sip-trunk`.
- `audio list`, `upload` and `tts` require `--project`. `credential add` and
  `credential list` take an optional `--project`; without it, `add` creates a
  team-wide credential and `list` returns only team-wide credentials.
- Provider keys are never read from an argument. `credential add` reads the
  variable named by `--key-env` (default `POLYMORFA_VOICE_PROVIDER_KEY`); when
  the default variable is unset it reads piped standard input (64 KiB limit)
  and refuses a terminal, because the repository has no hidden-input prompt.
  An explicitly named but unset variable is an error; it never falls back to
  stdin. The key is registered for redaction, so it is replaced with
  `[REDACTED]` if an error message ever contains it.

## Command decisions

- **Local refusals.** Upload type (from the extension, case-insensitive),
  empty files, files over 16,777,216 bytes, names over 100 characters,
  retention outside 1 to 3650, TTS text length (5000, or 4096 for `openai`),
  ElevenLabs voice IDs (`^[A-Za-z0-9]{1,64}$`), provider-specific model and
  OpenAI voice names outside the SDK's accepted sets, non-UUID IDs and oversized
  keys (over 512 characters) fail with exit code 2 before any request.
- **Content types.** `.mp3` sends `audio/mpeg`, `.wav` `audio/wav`, `.ogg` and
  `.opus` `audio/ogg`, `.m4a` `audio/x-m4a`, `.mp4` `audio/mp4`.
- **Waiting.** `--wait` reads the asset first and then every 2 seconds, like the
  SDK's `waitUntilReady`. `failed` exits with `voice_asset_failed` (13);
  reaching `--wait-timeout` exits with `request_timeout` (5). The budget begins
  after upload or TTS submission. Each status request receives an abort signal
  for the remaining budget, including body reads and SDK retries; no poll
  starts after the deadline and a result received after it is not returned.
  The upload request itself is not retried, matching the SDK.
- **Preview.** Without `--output` the command prints the 5-minute URL. With it,
  the file is downloaded without a credential, limited to 32 MiB, and an
  existing file is refused unless `--force` is given.
- **Confirmation.** Both deletes use the shared confirmation prompt, or
  `--yes` in noninteractive use.
- **No idempotency flags.** The contract defines no idempotency behavior for
  these routes.

## Exit codes

| Exit code | Code                                                                     |
| --------- | ------------------------------------------------------------------------ |
| 6         | `voice_not_enabled` (any status)                                         |
| 7         | `gate_limit_reached` (any status)                                        |
| 13        | `voice_asset_failed` (CLI condition for `--wait`)                        |
| 4         | `voice_asset_in_use`, `voice_asset_revision_conflict`, `asset_not_ready` |
| 2         | `provider_credential_invalid`, `invalid_parameter`, local refusals       |
| 5         | `provider_unavailable`, `voice_unavailable`, `request_timeout`           |

`src/errors/present.ts` maps the two voice codes before the status-based
classification, so they keep their exit code even if the API changes the HTTP
status.

## Explicit gaps

- This revision adds no command for the `voice.asset_ready` and
  `voice.asset_failed` webhook events; they arrive through the existing
  webhook, event and listener commands.
- No project-token support in these commands (see Credential rules).
- The CLI cannot release until `@polymorfa/sdk` with `client.voice` is
  published and pinned, and the API revision is deployed.
