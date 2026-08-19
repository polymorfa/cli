# Polymorfa CLI

The official command-line interface for Polymorfa.

The package is under active development and has not been published to npm.
The source repository is private, so GitHub installation requires repository
access until `@polymorfa/cli` is released publicly.

## Requirements

- Node.js 20 or newer
- A Polymorfa server API key for Platform requests
- A server API key or short-lived client token for Messaging requests

## Development installation

Install the current private development branch globally:

```shell
npm install --global github:polymorfa/cli#dev
polymorfa version
```

Build a local clone instead:

```shell
npm install
npm run build
npm link
polymorfa version
```

The verified version output includes both runtime components:

```text
polymorfa/0.1.0-dev.0 sdk/0.1.0-dev.0
```

## Authentication profiles

Until the backend exposes a revocable CLI device-authorization flow, login
accepts a server API key only through standard input:

```shell
printf '%s' "$POLYMORFA_API_KEY" | \
  polymorfa auth login --with-api-key --profile work

polymorfa auth list
polymorfa auth status --profile work
polymorfa auth use work
```

Profile metadata is written to the platform configuration directory. API keys
are stored separately in macOS Keychain, Windows Credential Manager, or Linux
Secret Service. A keyring failure stops the command; the CLI never silently
falls back to plaintext. `auth status` reports local secure-store availability
in this development slice and does not yet claim remote identity validation.

Environment credentials take precedence over the active profile for automation.
An explicit `--profile <name>` takes precedence over environment credentials.

## Groups

The first curated Messaging resource commands are read-only and require an
explicit session:

```shell
polymorfa group list --session session_123
polymorfa group view 123@g.us --session session_123
polymorfa group participants list 123@g.us --session session_123
polymorfa group invite-link 123@g.us --session session_123
```

Add `--json` for complete resource data and response metadata. Group and
participant lists are unpaged because the source API does not expose cursors.
Mutating group commands remain under implementation.

## Messages

Send text and perform the complete set of source-defined Messaging actions:

```shell
polymorfa message send text \
  --session session_123 \
  --to 15551234567@s.whatsapp.net \
  --body 'Hello'

polymorfa message react message_123 \
  --session session_123 \
  --chat 15551234567@s.whatsapp.net \
  --emoji '👍'

polymorfa message mark-seen message_123 \
  --session session_123 \
  --chat 15551234567@s.whatsapp.net

polymorfa message typing \
  --session session_123 \
  --chat 15551234567@s.whatsapp.net \
  --state typing

polymorfa message star message_123 \
  --session session_123 \
  --chat 15551234567@s.whatsapp.net
```

Add `--remove` to `message star` to unstar. Text sends accept repeatable
`--mention`, paired `--reply-to` and `--reply-participant`, and `--forwarded`.
Every mutation accepts `--idempotency-key` for safe retry identity. Server API
keys require `messages:write`; client tokens remain subject to their live
recipient rules, allowed actions, and rate limits.

The API does not expose message history, list, or search operations. Those
commands are not synthesized by the CLI. Additional typed send kinds will be
added as focused subcommands instead of a generic JSON payload interface.

## Media

Messaging media is distinct from Platform media and requires a server API key:

```shell
polymorfa media view media_123

polymorfa media download media_123 \
  --output ./attachment.bin

polymorfa media persist media_123 \
  --idempotency-key persist_media_123
```

`media download` retrieves metadata before fetching bytes and rejects media
larger than 100 MiB by default. Override the memory guard with `--max-bytes`
only when the process has enough memory. An explicit output path is required,
and existing files are preserved unless `--force` is passed. The SDK buffers
the complete response before the CLI writes it; this is not a streaming or
range-download command.

`media persist` asks the server to copy the media into configured object
storage. It does not write a local file. The source API has no Messaging media
upload, delete, list, resumable-upload, or streaming endpoint, so the CLI does
not advertise those operations.

## Raw API requests

`polymorfa api` is the complete-access escape hatch inspired by `gh api`. It
uses the public Polymorfa SDK for credential validation, HTTP transport,
timeouts, retries, error typing, request IDs, and response decoding.

Set credentials through the environment, never a command argument:

```shell
export POLYMORFA_API_KEY='pmfa_...'
polymorfa api /v1/projects --surface platform --json
```

Messaging accepts exactly one of `POLYMORFA_API_KEY` or
`POLYMORFA_CLIENT_TOKEN`. Platform accepts only `POLYMORFA_API_KEY`. Supplying
both Messaging credentials is an error rather than an implicit preference.

Examples:

```shell
polymorfa api /v1/projects --surface platform

polymorfa api /v1/campaigns \
  --surface platform \
  --method POST \
  --field projectId=project_123 \
  --field name='August launch' \
  --json

polymorfa api /v1/campaigns \
  --surface platform \
  --method POST \
  --input campaign.json

cat campaign.json | polymorfa api /v1/campaigns \
  --surface platform \
  --method POST \
  --input -
```

GET and HEAD fields become query parameters. Other methods encode fields as a
JSON object. `--input` reads one JSON value from a file or standard input and
is capped at 10 MiB. Use `--header name:value` for additional headers and
`--include` to include response metadata in human output.

`--json` prints exactly one JSON document on stdout. `--quiet` suppresses
successful output without hiding failures. Diagnostics and errors go to stderr;
SDK request IDs are preserved and active credentials are redacted.

`POLYMORFA_BASE_URL` exists only for development and controlled testing. It
overrides a profile endpoint and must not be placed in project files.

## Verification

```shell
npm run verify
```

The verification gate checks formatting, lint, strict TypeScript, tests,
production build, npm package contents, and the production dependency audit on
Node.js 20 and 22 in hosted CI.
