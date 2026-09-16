# Polymorfa CLI

The official command-line interface for Polymorfa.

The package is under active development and has not been published to npm.
The source repository is private, so GitHub installation requires repository
access until `@polymorfa/cli` is released publicly.

## Requirements

- Node.js 20 or newer; `calls watch` and `calls media` require Node.js 22 or
  newer
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

## Customers

Manage Customers through the Platform API with an organization server key and
an explicit project ID:

```shell
polymorfa customer status --project project_123
polymorfa customer enable \
  --project project_123 \
  --idempotency-key enable-customers-project-123

polymorfa customer create \
  --project project_123 \
  --name Ada \
  --external-id crm_456 \
  --idempotency-key create-customer-crm-456

polymorfa customer pairing-link create customer_123 \
  --project project_123 \
  --method qr \
  --method phone \
  --idempotency-key pair-customer-123
```

The `customer` commands cover project enablement, list filters and cursors,
profile creation and updates, archive and restore, assigned Numbers, recent
events, pairing-link creation/listing/revocation, and confirmed Number
transfers. Mutations that require retry identity also require
`--idempotency-key`. Archive, pairing-link revocation, and Number transfer
require explicit confirmation with `--yes`.

Pairing-link creation prints the one-time URL in human output. Store it when it
is returned. An idempotent replay returns the link record without the URL.

## Groups

The first curated Messaging resource commands are read-only and require an
explicit session:

```shell
polymorfa group list --session session_123
polymorfa group view 750000000001 --session session_123
polymorfa group participants list 750000000001 --session session_123
polymorfa group invite-link 750000000001 --session session_123
```

Add `--json` for complete resource data and response metadata. Group and
participant lists are unpaged because the source API does not expose cursors.
Mutating group commands remain under implementation.

## Messages

Send text and perform the complete set of source-defined Messaging actions:

```shell
polymorfa message send text \
  --session session_123 \
  --to +15551234567 \
  --body 'Hello'

polymorfa message react 740000000001 \
  --session session_123 \
  --chat +15551234567 \
  --emoji '👍'

polymorfa message mark-seen 740000000001 \
  --session session_123 \
  --chat +15551234567

polymorfa message typing \
  --session session_123 \
  --chat +15551234567 \
  --state typing

polymorfa message star 740000000001 \
  --session session_123 \
  --chat +15551234567
```

Add `--remove` to `message star` to unstar. Text sends accept repeatable
`--mention` with a Polymorfa user ID, `--reply-to` with a Polymorfa message ID,
and `--forwarded`. `--to` and `--chat` accept a conversation ID, E.164 phone
number, or BSUID. The API resolves message direction and sender identity.
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

polymorfa label chat list +15551234567 \
  --session session_123

polymorfa label chat replace +15551234567 \
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

polymorfa presence chat view +15551234567 \
  --session session_123

polymorfa presence chat subscribe +15551234567 \
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
polymorfa channel view 760000000001 --session session_123

polymorfa channel create \
  --session session_123 \
  --name 'Product updates' \
  --description 'Release announcements'

polymorfa channel message list 760000000001 \
  --session session_123 \
  --limit 25 \
  --before 951

polymorfa channel message updates 760000000001 \
  --session session_123 \
  --since 1787212800

polymorfa channel live-updates subscribe \
  760000000001 \
  --session session_123
```

Message and update listing return bounded arrays, not cursor pages. `--limit`
accepts 1–100 and maps to the source `count`; there is no `--paginate` or
returned `hasMore`. Live-update subscription returns a temporary duration. It
does not start a listener, socket, or watch process, and the API exposes no
unsubscribe operation.

Message actions are `channel message mark-viewed` and `channel message react`.
Human output includes both the public message ID for actions and `position=N`
for the numeric `--before` and `--after` pagination arguments.
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

polymorfa contact view 750000000001 --session session_123
polymorfa contact info 750000000001 --session session_123
polymorfa contact picture 750000000001 --session session_123
polymorfa contact devices 750000000001 --session session_123
polymorfa contact business-profile 750000000001 --session session_123
polymorfa contact blocklist --session session_123
polymorfa contact block 750000000001 --session session_123
polymorfa contact unblock 750000000001 --session session_123
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

## Calls

The `calls` commands place, answer, join, decline, leave, and end calls, invite
participants, follow a session's calls, and carry call audio:

```shell
polymorfa calls place +15550100 --session support --exclusive
polymorfa calls accept call_123 --exclusive --participant agent-7
polymorfa calls reject call_123
polymorfa calls leave call_123 --connection-id conn_0123456789
polymorfa calls end call_123
polymorfa calls invite call_123 +15550101

polymorfa calls watch --session support --json
polymorfa calls media --session support --place +15550100 \
  --input prompt.pcm --leave-on-eof --output reply.pcm

polymorfa calls settings get --session support
polymorfa calls settings set --session support --include-self-audio=true
```

Every inbound call rings until a participant answers or declines it. The CLI
never answers or declines on its own.

- **Participants.** A server API key acts as `server:<participant>`. Pass
  `--participant` (1 to 128 characters from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:`,
  `@`, and `-`) to name it; the API uses `default` otherwise. A client token
  from `POLYMORFA_CLIENT_TOKEN` acts as its own participant, so the CLI rejects
  `--participant` with a client token before sending a request.
- **Sessions.** Server API keys name the session with `--session` for
  `calls place`, `calls watch`, and `calls media`. Client tokens use the
  session they are bound to; `calls watch` and `calls media` reject
  `--session` with a client token.
- **Claims.** `calls accept --exclusive` claims the call. Other participants
  then receive `call_claimed`, and the command exits with code 4 and prints
  `code: "call_claimed"` under `--json`. Without a claim, a later accept joins
  the answered call. `calls reject` exits with code 4 and
  `code: "call_not_ringing"` when the call was already answered, declined, or
  ended. Declining ends the call for every participant.
- **Connections.** `calls leave` closes one connection, named by an 8 to 64
  character ID from `A-Z`, `a-z`, `0-9`, `_`, and `-`. The call continues.
  `calls end` ends the call for everyone.
- **Client token actions.** Client tokens can place, accept, decline, leave,
  end, invite, watch, and carry audio when the session's client rules allow
  it. The API decides; the CLI reports its errors unchanged.
- **Settings.** `calls settings` uses the Platform API and requires a server
  API key. `includeSelfAudio` controls whether the merged audio a connection
  receives includes its own audio. It is off by default.

`calls watch` streams inbound calls and their progress: `incoming`, `claim`,
`state`, `participant_joined`, `participant_state`, `participant_left`, and
`ended`. Human output prints one tab-separated line per update and status on
standard error. `--json` prints one JSON object per line, including `ready`,
`disconnected`, `notice`, and a final `stopped` line. `--count <n>` exits
after `n` updates; Ctrl-C stops cleanly with exit code 0. Watching reconnects
with backoff after network loss, and exits with code 3 when the API stops
authorizing the credential. It reports calls that ring after it connects, not
calls placed by other participants.

`calls media` carries one call's audio as raw PCM: signed 16-bit
little-endian, mono, at the call's sample rate (16 kHz by default). With
`--place <target>` it places a call and connects when it is answered. Without
it, the command waits for an inbound call that rings after it starts (the
given call ID, or the next call), then answers it, or joins it when another
participant answered without a claim. `--input <file|->` sends audio in real
time, `--output <file|->` receives audio (standard output by default, never a
terminal), and `--leave-on-eof` leaves after the input is sent. Status goes to
standard error, as JSON lines with `--json`. Ctrl-C leaves the call, or ends a
placed call that is still ringing. The command carries audio only.

Convert audio with any tool that writes raw PCM, for example:

```shell
sox greeting.wav -t raw -r 16000 -e signed -b 16 -c 1 - | \
  polymorfa calls media --session support --place +15550100 \
    --input - --leave-on-eof > reply.pcm
```

## Session call rejection and stable identities

`call reject` is a separate command for the Linked Device session route. It
rejects an incoming call by session, call ID, and caller ID. Use
`calls reject` for the unified Calls API. Three focused Linked Device commands
cover the exact session call rejection, LIDs, and Users source tags:

```shell
polymorfa call reject call_123 \
  --session session_123 \
  --from 750000000001 \
  --idempotency-key reject_call_123

polymorfa identity resolve \
  --session session_123 \
  --phone-number +15551234567

polymorfa identity resolve \
  --session session_123 \
  --username alice \
  --username-key 1234

polymorfa user security-code 750000000001 --session session_123
```

All three require a server API key and an active Linked Device session. Call
rejection requires the incoming call ID and caller's Polymorfa ID; it is not call accept,
placement, history, or streaming. Identity resolution accepts exactly one phone
number, decimal Polymorfa user ID, or username. A username
key is exactly four digits and is valid only with `--username`.

Security-code lookup accepts only a decimal Polymorfa user ID. Human output
shows the 60-digit numeric verification code and identity, but does not dump the
base64 display QR. `--json` preserves the complete response and no-store header
metadata. The private WhatsApp verification payload is never returned by the
API. The source exposes no bulk identity resolution, call list/history, security-code
history/refresh, or verification-submit operation.

## Business App

The complete Linked Device Business App surface requires a server API key and
an active connected session. Its resource tree keeps the account's own profile,
catalog, products, collections, orders, compliance, and linked-account state
separate:

```shell
polymorfa business profile view --session session_123
polymorfa business catalog view --session session_123 --id 750000000001
polymorfa business product view product_123 \
  --session session_123 \
  --id 750000000001
polymorfa business collection list --session session_123 --id 750000000001
polymorfa business compliance view --session session_123
polymorfa business accounts view --session session_123
polymorfa business eligibility view --session session_123
```

Structurally rich mutations accept one bounded JSON document from a file or
standard input, matching the `gh api --input` convention:

```shell
polymorfa business profile update \
  --session session_123 \
  --input profile-update.json

polymorfa business product create \
  --session session_123 \
  --input product.json

polymorfa business product replace product_123 \
  --session session_123 \
  --input product-replacement.json

polymorfa business compliance replace \
  --session session_123 \
  --input compliance.json
```

Product replacement requires an explicit `hidden` boolean because the pinned
runner treats omission as `false` and can otherwise unhide an existing product.
Product images require exactly one `url`, `base64`, or trusted `mediaUrl`
source; the CLI additionally accepts `file` and converts a locally preflighted
image into the SDK's base64 form. Local product images are bounded to 16 MiB.
Price strings use integer thousandths and require a three-letter uppercase
currency. Appeal commands enforce the live 4,096 UTF-8 byte limit.

Cover photos accept exactly one `--url` or local `--file`; local files are
bounded to 5 MiB and sent as base64 JSON. Collection create/update use
repeatable product flags, while reorder accepts a JSON move list. Permanent
cover-photo, product, and collection deletions require `--yes`. Every mutation,
including the POST order lookup, accepts `--idempotency-key`.

Catalog and collection reads expose source cursors without claiming automatic
pagination. A single collection accepts an `--after` cursor but its response
has no next cursor. Order lookup requires the exact event token and is not an
order-history command. The source exposes no catalog-independent list, product
or collection search/history, binary upload, resumability, or Business App
support for project credentials, client tokens, or Cloud API sessions.

## Platform access and security

Organization server API keys can inspect the credential, membership, audit,
ban, incident, durable-operation, and project-token metadata made available by
the Platform API:

```shell
polymorfa key list
polymorfa key revoke key_123 --yes --idempotency-key revoke_key_123
polymorfa member list
polymorfa audit-log list --action key.revoked --resource api-key --limit 100
polymorfa session-ban list --active
polymorfa security-incident list
polymorfa security-incident acknowledge incident_123
polymorfa project-token list --project project_123
polymorfa widget view --project project_123
polymorfa widget update --project project_123 --input widget-patch.json
polymorfa session stop session_1 session_2 --project project_123
polymorfa session delete session_1 session_2 --project project_123 --yes
```

Key and project-token lists contain metadata only; neither command returns raw
bearer material. The API's reported API-key scope mask is retained in JSON but
must not be treated as proof of live authorization. `key revoke` requires
`--yes` because revocation is immediate. If a successful response is lost, a
retry can return not found because the API does not persist idempotency keys for
this route. Security-incident acknowledgement is repeatable and sends no body.

Audit filters are exact matches, and `--limit` is bounded to 1 through 500.
These list operations return complete arrays and expose no cursor. Project-token
listing requires one explicit project ID. Operation inspection is console-only;
the CLI does not expose operation polling or cancellation.

Member invite, role update, and removal remain dashboard-session routes and are
not exposed through server-key commands. The API also exposes no compatible
API-key creation, token mint/revoke, incident detail, or cross-project token
aggregate in this typed slice. The raw API command is not a credential-boundary
bypass.

Widget view returns `null` in JSON when no settings row has been saved. Update
accepts one bounded JSON object from `--input`; the target project is selected
separately with `--project` and cannot be hidden in that input. Omitting the
project targets organization defaults. Widget logo fields are existing storage
identifiers, not file, URL, base64, upload, or download operations. Widget
access requires the source `widget:create` scope.

Session stop and delete accept 1 through 100 unique UUIDs or stable slugs. The
CLI trims IDs and rejects duplicates or oversized batches before transport.
Returned counts are matching rows, not the number requested. Stop only requests
asynchronous work and does not wait for completion. Delete synchronously removes
matching management rows and requires `--yes`; subsequent device termination is
best effort. Neither operation returns an operation ID or supports status,
watch, stream, cancellation, history, or per-item results. Retrying stop can
enqueue another request, while repeated deletion counts only rows still present.

## Messaging campaigns

Campaign commands use organization Messaging API keys and require an explicit
project slug because the source routes are slug-scoped:

```shell
polymorfa campaign list --project-slug launch-project
polymorfa campaign create --project-slug launch-project --input campaign.json
polymorfa campaign view campaign_123 --project-slug launch-project
polymorfa campaign analytics campaign_123 --project-slug launch-project

polymorfa campaign launch campaign_123 \
  --project-slug launch-project \
  --scheduled-at 2026-09-01T12:00:00Z
polymorfa campaign pause campaign_123 --project-slug launch-project
polymorfa campaign resume campaign_123 --project-slug launch-project
polymorfa campaign stop campaign_123 --project-slug launch-project --yes
polymorfa campaign requeue campaign_123 \
  --project-slug launch-project \
  --include-skipped-error
```

Launch, pause, resume, and stop return accepted durable work; they do not wait
for the state transition. Check the campaign with `polymorfa campaign view`.
Operation inspection is console-only; the CLI has no operation-polling command.

Launch times accept epoch milliseconds or timezone-qualified ISO 8601
instants. List returns one complete newest-first array with no cursor. Requeue
is synchronous and reports only the number moved. Every mutation accepts
`--idempotency-key`, but the API does not persist the header, so it must not be
treated as server-side deduplication.

The source exposes no campaign update, delete, validate, archive, duplicate,
recipient, event, history, replay, watch, or operation-cancel route. The CLI
does not substitute similarly named Platform campaign methods for these gaps.

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

### Guided session creation and configuration

Create real or simulated sessions with `polymorfa quicklink create --project <id> --input request.json`.
The request accepts `configuration` for connection, phone, history and test simulation.
Page copy, appearance, legal links and callbacks belong in saved widget settings.
Free-tier real accounts must pair inside the authenticated Console.

Session configuration uses Platform authority and requires a server API key.
Updates reject unknown fields, invalid nested values, and fields listed in both `set` and `reset` before sending a request. Include at least one of `set` or `reset`; the API enforces permissions, consent, and storage eligibility.
Inspect configuration with `polymorfa session configuration get <session>`.
Update it with `polymorfa session configuration update <session> --input update.json`:

```json
{
  "revision": 2,
  "configuration": {
    "set": {"historySync": {"mode": "deliver"}},
    "reset": ["historySync.requestFull"]
  }
}
```

Use the revision from the preceding read. Reset removes an override so future defaults
continue to apply. A saved update can remain pending until the runtime acknowledges it.
The CLI does not offer direct session creation; QuickLinks preserve onboarding authority.

Upload simulated history separately from configuration, then use the returned
fixture ID in `configuration.testing.configuration.historyFixtureId`:

```sh
polymorfa testing history-fixture create --project PROJECT_ID --input history.json
```

The file contains `messages`, with up to 100 entries specifying `id`,
`senderPhone`, `text`, `timestamp` (Unix seconds), and `fromMe`. Senders must be
existing simulated numbers in the selected project. This command does not enable
hosted message storage.

## Prepaid billing responses

`polymorfa api /platform/billing --surface platform --json` preserves fractional
credit quantities. Fields ending in `Cents` in the prepaid balance and usage
responses are credits, not cash minor units.

A request denied for insufficient funding returns `payment_required`, preserves
the API error code and request ID, and exits with code 4. This is not a retryable
server error. Add credit or resolve the billing restriction in the Console before
retrying. HTTP 409 from an expired tier quote also requires reviewing a new quote;
the CLI never creates or confirms a replacement purchase automatically.

For a tier change, use the raw API command to create a quote with
`POST /platform/sessions/{sessionId}/tier-quotes`, review the returned charge,
then explicitly submit its `quoteId` with `PATCH /platform/sessions/{sessionId}`.
Read `GET /platform/sessions/{sessionId}/tier-quotes/{quoteId}` until the result is
applied or rejected. Store the full JSON request in a file and pass `--input` when
it contains numeric values or `null`; `--field` creates string values.
