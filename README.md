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

## Labels

Labels require a server API key and an explicit Messaging session:

```shell
polymorfa label list --session session_123
polymorfa label create --session session_123 --name Priority --color 5
polymorfa label update label_123 --session session_123 --name Urgent
polymorfa label delete label_123 --session session_123 --yes

polymorfa label chat list 15551234567@s.whatsapp.net \
  --session session_123

polymorfa label chat replace 15551234567@s.whatsapp.net \
  --session session_123 \
  --label priority \
  --label customer
```

`label chat replace` replaces the complete set; it is not incremental attach.
Use `--clear` to detach every label. The command rejects calls that provide
neither labels nor `--clear`. Add `--include-observation` to list commands when
policy and freshness metadata are needed. Label reads are unpaged, and the API
exposes no message-label operation.

## Quick Replies

Stored business quick replies require a server API key and an explicit
Messaging session:

```shell
polymorfa quick-reply list --session session_123

polymorfa quick-reply create \
  --session session_123 \
  --shortcut /hours \
  --message 'We are open from 09:00 to 17:00.' \
  --keyword hours \
  --keyword opening

polymorfa quick-reply replace reply_123 \
  --session session_123 \
  --shortcut /hours \
  --message 'We are open from 08:00 to 18:00.'

polymorfa quick-reply delete reply_123 --session session_123 --yes
```

`quick-reply replace` replaces the complete shortcut and message rather than
applying a partial patch, so both flags are required. `--keyword` is repeatable,
and create and replace also accept `--count`. Every mutation accepts
`--idempotency-key`. List output preserves the source observation policy and
freshness metadata under `--json`.

The source API exposes no retrieve-by-ID, send, sync, history, search, or
pagination operation for quick replies, so the CLI does not advertise those
commands. Interactive message buttons are a separate message-send concept.

## Profile

View and update the connected account's Messaging profile with a server API
key:

```shell
polymorfa profile view --session session_123
polymorfa profile name set --session session_123 --name Polymorfa
polymorfa profile status set --session session_123 --status Available

polymorfa profile picture set \
  --session session_123 \
  --file ./profile.jpg

polymorfa profile picture set \
  --session session_123 \
  --url https://example.com/profile.jpg

polymorfa profile picture delete --session session_123 --yes
```

Picture setting requires exactly one source. `--file` reads at most 50 MiB and
sends bounded base64 JSON; it is not a multipart or streaming upload. `--url`
asks the Messaging service to retrieve the remote image. Every mutation accepts
`--idempotency-key`.

JSON output preserves the service response and SDK request metadata. Human
profile output supports both the published profile fields and the connected
account fields returned by the development service. The source exposes no
profile history, picture download, binary upload, streaming, or pagination
operation.

## Privacy

View and change account-level Messaging privacy with a server API key:

```shell
polymorfa privacy view --session session_123

polymorfa privacy set \
  --session session_123 \
  --setting online \
  --value match_last_seen

polymorfa privacy disappearing-timer set \
  --session session_123 \
  --duration 7d
```

The setting command validates each value against its selected setting using the
SDK's canonical runtime matrix. An invalid pair fails before transport and
prints that setting's allowed values. Mutations accept `--idempotency-key`.

Account-default timer choices are `off`, `24h`, `7d`, and `90d`. This command
does not change an existing chat's timer; per-chat disappearing messages use a
separate Chats operation. The source exposes no privacy history, pagination,
value-list endpoint, or allowlist/blacklist member-management route.

## Presence

View the remembered self state, change it with a server key, or inspect and
renew policy-governed chat observations:

```shell
polymorfa presence view --session session_123
polymorfa presence set --session session_123 --state available

polymorfa presence chat view 15551234567@s.whatsapp.net \
  --session session_123

polymorfa presence chat subscribe 15551234567@s.whatsapp.net \
  --session session_123
```

`presence view` reports the service's remembered desired and last-sent state;
it is not a live authoritative account query. `presence chat view` reports a
retained observation and includes policy, freshness, staleness, and separate
typing-observation fields. It does not bypass the configured observation
policy.

Reads and subscription accept either a server API key or an appropriately
scoped, session-bound client token. Changing self presence requires a server
API key. Repeat `presence chat subscribe` before the returned `expiresAt` to
renew the subscription; the API exposes no watch, history, polling helper, or
unsubscribe operation. Mutations accept `--idempotency-key`.

## Channels

Channels are connected-session resources and require a server API key:

```shell
polymorfa channel list --session session_123
polymorfa channel view 120363000000000000@newsletter --session session_123

polymorfa channel create \
  --session session_123 \
  --name 'Product updates' \
  --description 'Release announcements'

polymorfa channel message list 120363000000000000@newsletter \
  --session session_123 \
  --limit 25 \
  --before 951

polymorfa channel message updates 120363000000000000@newsletter \
  --session session_123 \
  --since 1787212800

polymorfa channel live-updates subscribe \
  120363000000000000@newsletter \
  --session session_123
```

Message and update listing return bounded arrays, not cursor pages. `--limit`
accepts 1–100 and maps to the source `count`; there is no `--paginate` or
returned `hasMore`. Live-update subscription returns a temporary duration. It
does not start a listener, socket, or watch process, and the API exposes no
unsubscribe operation.

Message actions are `channel message mark-viewed` and `channel message react`.
An empty reaction removes the caller's reaction. Channel-level actions are
`follow`, `unfollow`, `mute`, and `unmute`. Mutations accept
`--idempotency-key`, and deletion additionally requires `--yes`.

Channel creation intentionally has no picture flag: the published request field
is ignored by the pinned service implementation. The CLI will expose it only
after the source contract and runner agree. Channels remain separate from chats
and groups, and the source has no dedicated channel-send operation.

## Contacts

Contacts are Linked Device resources and require a server API key:

```shell
polymorfa contact list --session session_123

polymorfa contact check \
  --session session_123 \
  --phone +15551234567 \
  --phone +15557654321

polymorfa contact view alice@lid --session session_123
polymorfa contact info alice@lid --session session_123
polymorfa contact picture alice@lid --session session_123
polymorfa contact devices alice@lid --session session_123
polymorfa contact business-profile alice@lid --session session_123
polymorfa contact blocklist --session session_123
polymorfa contact block alice@lid --session session_123
polymorfa contact unblock alice@lid --session session_123
```

`contact view` reads contact data known to the connected session. `contact info`
requests live WhatsApp user metadata. The CLI keeps those sources distinct.
`contact picture` returns the service-provided URL and does not download the
image. `contact devices` returns the upstream linked-device JIDs without
inventing local device records.

`contact check` accepts repeatable `--phone` values and checks them in one
request. Lists are complete arrays because the source exposes no contact
pagination. Block and unblock are reversible actions and accept
`--idempotency-key`; they are not available to browser client tokens.

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
