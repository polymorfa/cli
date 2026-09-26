# Polymorfa CLI

The official command-line interface for Polymorfa.

The package is under active development. `@polymorfa/cli` is not published to
npm yet, so `npm install --global @polymorfa/cli` does not work. Once the CLI is
published, that command will be the supported installation. Until then, install
from the private source repository, which requires repository access.

## Requirements

- Node.js 22 or newer
- A Polymorfa organization API key or exact-project token for developer requests
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

Both methods install the CLI's dependencies, including the TypeScript SDK
`@polymorfa/sdk`, from the public npm registry. The CLI pins one exact SDK
prerelease in `package.json`.

The version output includes both runtime components:

```text
polymorfa/0.1.0-dev.0 sdk/0.1.0-dev.20260926005918
```

The SDK component reports the version built into the installed SDK. Dev
prereleases include their full timestamped version. Run `npm ls @polymorfa/sdk`
to see the installed build.

## Authentication profiles

Until the backend exposes a revocable CLI device-authorization flow, login
accepts an organization API key or exact-project token through standard input:

```shell
printf '%s' "$POLYMORFA_API_KEY" | \
  polymorfa auth login --with-api-key --profile work

polymorfa auth list
polymorfa auth status --profile work
polymorfa auth use work

printf '%s' "$POLYMORFA_PROJECT_TOKEN" | \
  polymorfa auth login --with-project-token --project project_123 --profile project-work
```

Profile metadata records its explicit project or organization owner. Credentials
are stored separately in macOS Keychain, Windows Credential Manager, or Linux
Secret Service. A keyring failure stops the command; the CLI never silently
falls back to plaintext. `auth status` reports local secure-store availability
in this development slice and does not yet claim remote identity validation.

Environment credentials take precedence over the active profile for automation.
An explicit `--profile <name>` takes precedence over environment credentials.

## Project context

Select a default project per profile, or link a directory so every command run
inside it uses one project:

```shell
polymorfa project list               # projects for the current credential; * marks the current one
polymorfa project use my-app         # store the project on the active profile
polymorfa project use my-app --profile work
polymorfa link --project my-app      # write polymorfa.json here
polymorfa project current            # show the project and where it comes from
```

Commands resolve the project in this order: `--project`, the nearest
`polymorfa.json` in the current directory or a parent, then the
profile's stored project. Organization-owned commands ignore linked and profile
projects. `--verbose` prints the link file in use.

`project use` and `link` accept a UUID or a unique slug and store the canonical
UUID. The link file holds only `{"version": 1, "project": "<uuid>"}`, never a
credential, so it is safe to commit. `link` without `--project` uses the
profile's project, and replacing a link to a different project requires
`--force`. Project-token profiles stay bound to their one project: `project use`
rejects any other project, and a command fails if the directory is linked to a
different project. `polymorfa listen` falls back to the linked or profile
project when `--project` is omitted.

## Doctor

```shell
polymorfa doctor
polymorfa doctor --profile work --json
```

`doctor` runs five checks and exits with code 1 if any fails:

| Check        | What it does                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node`       | Requires Node.js 22 or newer.                                                                                                                                                                                                        |
| `config`     | Loads and validates the profile config and reports the active profile.                                                                                                                                                               |
| `keyring`    | Reads the selected profile's entry from the operating-system keyring. A locked or unavailable keyring fails, or warns when an environment credential is in use.                                                                      |
| `api`        | Calls the unauthenticated `/ping` on the configured base URL, without retries.                                                                                                                                                       |
| `credential` | For a server API key, lists projects as an authenticated ping. `401` fails; `403` warns that the key authenticated but project listing was denied. Project and client tokens are reported as present but are not validated remotely. |

Environment credentials take precedence over the active profile, as for other
commands. Output never contains credential values.

## QuickLinks

A QuickLink is a persistent hosted link that connects one WhatsApp number to a
new session in a project. Create one from a JSON request with an organization
API key that has `quicklink:manage`:

```shell
polymorfa quicklink create \
  --project 11111111-1111-4111-8111-111111111111 \
  --input quicklink.json
```

The request accepts `customerId`, `externalId`, and `configuration`. See
[Guided session creation and configuration](#guided-session-creation-and-configuration)
for the configuration fields.

Inspect or cancel a link with an organization API key or an exact-project
token that has `quicklink:manage`:

```shell
polymorfa quicklink view ql_123 \
  --project 11111111-1111-4111-8111-111111111111

polymorfa quicklink cancel ql_123 \
  --project 11111111-1111-4111-8111-111111111111 \
  --yes
```

Creation prints the hosted URL. Treat it as a credential and share it only with
the person holding the phone. The CLI never retrieves direct session QR payloads
or pairing codes. Cancel requires `--yes` and invalidates an unconnected link.
For an initial real link, the API returns `202` after accepting cancellation;
Number and session cleanup can continue afterward. Supplementary and test
links return `200` when cancellation completes. Cancellation fails for a link
that has already connected. The API does not accept an
idempotency key for cancellation. The API exposes no QuickLink list, recovery,
or history operation, so the CLI does not synthesize them.

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
  --expected-phone +15551234567 \
  --idempotency-key pair-customer-123
```

Customer profiles hold a name and an external ID; they have no phone field. To
reserve an invitation for one number, pass `--expected-phone` to
`customer pairing-link create`. Pairing links accept `--method`,
`--expected-phone`, and `--expires-in`; page language and theme are not
per-link options.

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

Create and change groups with a server API key that has `groups:manage`:

```shell
polymorfa group create --session session_123 \
  --name 'Launch team' \
  --participant 750000000001 --participant 750000000002

polymorfa group participants add 750000000009 --session session_123 --participant 750000000003
polymorfa group participants promote 750000000009 --session session_123 --participant 750000000003
polymorfa group participants demote 750000000009 --session session_123 --participant 750000000003
polymorfa group participants remove 750000000009 --session session_123 --participant 750000000003 --yes

polymorfa group subject 750000000009 --session session_123 --value 'Launch crew'
polymorfa group description 750000000009 --session session_123 --value ''

polymorfa group settings 750000000009 --session session_123 \
  --messaging admins --info-editing admins --member-add all --join-approval on
```

Participants are Polymorfa user IDs. Resolve phone numbers with
`polymorfa identity resolve` first. An empty `--value` clears the description.
`group settings` applies each requested setting with its own API call, in the
order info editing, messaging, member add, join approval. If one fails, the
error names the settings that were already applied. Removing participants
requires `--yes`.

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

JSON message output preserves `whatsapp_ids.linked_devices` and
`whatsapp_ids.official_api` when supplied by the API. Use the Polymorfa message
`id` for replies and actions; provider references remain strings.

Add `--remove` to `message star` to unstar. Text sends accept repeatable
`--mention` with a Polymorfa user ID, `--reply-to` with a Polymorfa message ID,
and `--forwarded`. `--to` and `--chat` accept a conversation ID, E.164 phone
number, or BSUID. The API resolves message direction and sender identity.
Server API keys require `messages:write`; client tokens remain subject to their
live recipient rules, allowed actions, and rate limits.

### Retry identity

Every `message send` variant, `message react`, `message edit`, and
`message delete` sends an `Idempotency-Key` by default. When you omit
`--idempotency-key`, the CLI or its SDK generates a fresh key for that command
invocation. Automatic HTTP retries within the invocation reuse it.

To retry across separate CLI processes or script runs, choose a key before the
first attempt and pass the same `--idempotency-key` on each attempt. Keep the
request, credential, and API version unchanged. Running the command again
without an explicit key creates a new request and can repeat the write.

```shell
# Reuse order-123-shipped only when retrying this exact notification.
polymorfa message send text \
  --session session_123 --to +15551234567 \
  --body 'Your order shipped.' --idempotency-key order-123-shipped
```

For 24 hours after the first request, the API prevents the same key and request
from running the write again:

- A recorded success returns `409 idempotency_completed` with
  `Idempotent-Replayed: true`. The CLI reports an error; the response does not
  contain the original message or response body.
- A recorded server error returns its status and error code with
  `Idempotent-Replayed: true`. The write may have happened.
- A request still running returns `409 idempotency_in_progress` with
  `Retry-After`. An unrecorded outcome returns
  `409 idempotency_outcome_unknown` and blocks another attempt with that key.
- Reusing a key for a changed request returns `409 idempotency_conflict`.

Keep the first response when you receive it. If the outcome is uncertain, check
message events or webhooks before deciding whether to use a new key. A new key
does not resolve the uncertainty and can send a duplicate. See the
[Messaging retry contract](https://docs.polymorfa.com/guides/communicate/overview#retry-sends-safely).

`message mark-seen`, `message typing`, and `message star` accept an explicit
`--idempotency-key`, but the API does not deduplicate those actions by that
header.

### Typed sends

Every `message send <kind>` command accepts the same `--session`, `--to`,
`--reply-to`, `--mention`, `--forwarded`, and `--idempotency-key` flags as
`message send text`:

```shell
# Media from a local file (sent inline as base64) or a public URL
polymorfa message send image --session session_123 --to +15551234567 --file ./photo.jpg --caption 'Today'
polymorfa message send video --session session_123 --to +15551234567 --url https://example.com/clip.mp4
polymorfa message send audio --session session_123 --to +15551234567 --file ./note.ogg --voice
polymorfa message send document --session session_123 --to +15551234567 --file ./invoice.pdf

polymorfa message send template --session session_123 --to +15551234567 \
  --name order_update --language en_US --components components.json
polymorfa message send location --session session_123 --to +15551234567 \
  --lat 51.5007 --long=-0.1246 --address 'Westminster'
polymorfa message send contact --session session_123 --to +15551234567 \
  --name 'Ada Lovelace' --phone +15557654321
polymorfa message send poll --session session_123 --to 730000000001 \
  --title 'Lunch?' --option Pizza --option Sushi --multi-select
polymorfa message send buttons --session session_123 --to +15551234567 \
  --body 'Confirm your order?' --button reply:yes=Yes --button reply:no=No
polymorfa message send list --session session_123 --to +15551234567 \
  --title 'Pick a slot' --button-text Choose \
  --row 'Morning/am9=9:00' --row 'Afternoon/pm2=14:00|Near the office'
```

- Media commands take exactly one of `--file` or `--url`. Local files are
  limited by `--max-bytes` (100 MiB by default) and the MIME type is inferred
  from the extension unless `--mime-type` is set. `document` sends the local
  file name unless `--filename` overrides it. `audio --voice` sends a
  push-to-talk voice note.
- `template --components` reads a JSON array from a file or `-` for stdin.
- Pass negative coordinates as `--lat=-33.86` so they are not read as flags.
- `contact` builds a vCard 3.0 from `--name`, repeatable `--phone`, and
  `--organization`, or sends the vCard file given by `--vcard`.
- `poll` takes 2 to 12 unique `--option` values.
- `buttons` takes repeatable `--button` values: `reply:<id>=<text>`,
  `url:<text>=<url>`, `call:<text>=<+E.164>`, or `copy:<text>=<code>`.
- `list` takes repeatable `--row` values `[<section>/]<id>=<title>[|<description>]`.
  Rows with the same section are grouped in order.

The API has no sticker send kind, so the CLI has no `message send sticker`.

### Edit and delete

```shell
polymorfa message edit 740000000001 --session session_123 --chat 730000000001 --body 'Corrected text'
polymorfa message delete 740000000001 --session session_123 --chat 730000000001 --yes
```

Edit and delete require `chats:manage`. Delete asks for confirmation; pass
`--yes` in scripts.

### Stored chat history (beta)

For a Number with hosted message storage (HMS) enabled, an enrolled team can
read stored chats and messages. An owner or admin enrolls the team on the
Console **Numbers** page. Storage includes only messages sent or received after
HMS was enabled. Test Numbers have no stored history. These read commands
require a server API key or project token; client tokens cannot read history.

```shell
polymorfa chat list --session NUMBER_ID --limit 20 --kind direct
polymorfa chat view +15550001111 --session NUMBER_ID
polymorfa chat message list +15550001111 --session NUMBER_ID --limit 20 --order desc
polymorfa chat message view +15550001111 739182640518204 --session NUMBER_ID
```

Chat reads require `chats:read`; message reads require `messages:read`. Older
credentials, including full-access keys created before `messages:read` existed,
need a new credential with that scope explicitly selected. Use `--json` to keep
the page's `hasMore`, `nextCursor`, and `previousCursor` fields. Human output
also prints non-null cursors. Pass `--cursor` back with the same path and filters;
changing either produces `400 invalid_parameter`. Message filters include
`--since`, `--until`, `--direction`, and comma-separated `--types`; chat filters
include `--kind`, `--active-since`, and `--active-before`. The API defaults to a
page of 50 and permits `--limit` from 1 through 100.

Without enrollment, the API returns `403 permission_denied`; without HMS on
the Number it returns `404 hms_not_enabled`. `503 service_unavailable` means
the Number's regional history service cannot be reached. No search command is
available. See the [message history guide](https://docs.polymorfa.com/guides/communicate/message-history)
for retention and media download behavior.

## Media

Messaging media is distinct from Platform media and requires a server API key:

```shell
polymorfa media view media_123

polymorfa media download media_123 \
  --output ./attachment.bin

polymorfa media download media_123 --url

polymorfa media download --from-event ./message.json \
  --output ./photo.jpg

polymorfa media persist media_123 \
  --idempotency-key persist_media_123
```

`media download` retrieves metadata, then streams the file into a temporary
sibling file and renames it into place when the download completes. It
rejects media larger than 100 MiB by default, both from the declared size and
while bytes arrive. Raise the limit with `--max-bytes`. An explicit
`--output` path (`-o`) is required. Existing files are kept unless you pass
`--force`, and an interrupted or rejected download leaves no partial file.
When the API redirects to object storage, the CLI requests the storage URL
without your API key.

`--url` prints the short-lived signed storage link to stdout instead of
downloading it, and writes a warning to stderr. Anyone who has the link can
fetch the file until it expires, so do not log, store or share it. If the API
streams the media itself, no link exists and the command exits with code 2.

`--from-event <file>` reads a stored message webhook, either the full event
or its `payload`. It downloads the encrypted attachment from the WhatsApp CDN
and verifies and decrypts it locally, with no Polymorfa credential. It works
only for messages that carry the `media` descriptor, which projects without
media persistence receive. The event file contains the decryption key: keep
it private. If verification fails, the command exits with code 2 and writes
no file. The CDN link in the event expires, so older events stop working.

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
participants, follow a session's calls, and carry call audio. `calls stats` and
`calls export` report on past calls; see
[Call statistics and export](#call-statistics-and-export). For example:

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
polymorfa calls settings set --session support --no-conference-mode
polymorfa calls settings set --session support --calls-enabled=false \
  --expected-revision 3
polymorfa calls settings set --session support \
  --inbound-route sip_trunk --sip-trunk 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10

polymorfa calls retention get
polymorfa calls retention set --policy compliance --expected-revision 0
polymorfa calls retention set --policy custom --days 14 --expected-revision 1 --yes
```

This source revision also adds `calls place-group` and `calls ring`. They require
the matching Calls API and a published SDK version that includes group controls;
the release must update the pinned SDK dependency before these commands ship.

```shell
polymorfa calls place-group --session support --to +15550100 --to +15550101
polymorfa calls ring call_123 +15550101
```

Group placement accepts 2 to 31 distinct recipients and checks every recipient's
calling permissions. Group calls require a Linked Device Number. `calls ring`
only rings a non-connected participant already in the call roster; successful
submission does not mean that the participant answered.

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
- **Number restrictions.** When WhatsApp restricts the Number to people it has
  already chatted with, `calls place` and `calls invite` exit with code 3 and
  `code: "number_restricted"` for anyone else; calls to people it has already
  chatted with still work. A call WhatsApp refuses for that reason ends with
  `reason: "call_restricted"` in `calls watch`.
  `polymorfa listen --event session.restriction_updated` reports the
  restriction starting and ending.
- **Connections.** `calls leave` closes one connection, named by an 8 to 64
  character ID from `A-Z`, `a-z`, `0-9`, `_`, and `-`. The call continues.
  `calls end` ends the call for everyone.
- **Client token actions.** Client tokens can place, accept, decline, leave,
  end, invite, watch, and carry audio when the session's client rules allow
  it. The API decides; the CLI reports its errors unchanged.
- **Settings.** `calls settings` uses the Platform API and requires a server
  API key. `--calls-enabled=false` turns calling off for the session: placing,
  answering and joining calls then exit with code 3 (`calls_disabled`),
  incoming calls are declined, and calls in progress continue.
  Conference mode is on by default: every participant you connect to a call
  (apps, bots, and SIP trunk callers) hears the WhatsApp party and each other.
  `--no-conference-mode` turns it off, so each participant hears only the
  WhatsApp party; `--conference-mode` turns it back on. The WhatsApp party
  always hears all of your participants, and nobody hears their own audio.
  `--inbound-route sip_trunk` with `--sip-trunk` also sends incoming calls to a
  SIP trunk; `--sip-claim` controls whether the trunk's answer claims the
  call. On a Cloud API session, `--host-cloud-api-calls=true` has Polymorfa
  Calls answer incoming calls; with the default `false`, your Graph API
  integration answers them. `calls settings set` sends only the flags you pass; the other
  settings keep their values. `calls settings get` and `set` print the
  settings `revision`, which increases on every change and is `0` while the
  session uses the defaults. Pass `--expected-revision <n>` to apply the
  change only if the settings still have that revision; if someone changed
  them first, the command exits with code 4 (`state_conflict`) and changes
  nothing.
- **Call data retention.** `calls retention` reads and changes how long
  Polymorfa keeps your team's call data. It uses the Platform API with a team
  API key or a project token (`POLYMORFA_API_KEY`, `POLYMORFA_PROJECT_TOKEN`,
  or a profile); client tokens are refused. `--policy short`,
  `standard`, `extended`, or `compliance` keeps call data for 7, 30, 90, or
  365 days; `--policy custom --days <n>` keeps it for 1 to 2555 days. Teams
  without a saved setting use `extended` (90 days) at revision `0`. Deletion
  of call data older than the period starts on a date Polymorfa announces in
  its changelog; until then the setting records a choice and nothing is
  deleted.
  `calls retention get` prints the policy, period, the kinds of call data it
  applies to, and the `revision`. `calls retention set` requires
  `--expected-revision <n>`: it reads the setting first and changes it only if
  it still has that revision; otherwise it exits with code 4
  (`state_conflict`) and changes nothing, so read the setting again and retry.
  Once deletion runs, a shorter period also applies to call data already
  stored, and deleted call data cannot be recovered. The command asks you to type `yes` before it
  shortens the period; `--yes` confirms without a prompt, and without a
  terminal the command exits with code 2 (`confirmation_required`) unless you
  pass `--yes`. Changing retention requires a team API key with the
  `sessions:read` and `sessions:manage` scopes, because the command reads the
  setting before it changes it. Project tokens can read the setting; the API
  refuses their changes, and the command exits with code 3.

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
placed call that is still ringing. If the `--output` file cannot be written,
or the `--input` file cannot be read, the command leaves the call and exits
with code 2. It exits with code 2 before connecting when the `--input` file
cannot be opened or when `--input` and `--output` name the same file. The
command carries audio only. `--muted` receives audio with this connection muted;
it cannot be combined with `--input`. The command refuses `--muted` before
connecting when its pinned Calls SDK lacks media-control support.

Convert audio with any tool that writes raw PCM, for example:

```shell
sox greeting.wav -t raw -r 16000 -e signed -b 16 -c 1 - | \
  polymorfa calls media --session support --place +15550100 \
    --input - --leave-on-eof > reply.pcm
```

### Call consent

Polymorfa checks every call against the team's call policy before the
destination rings. `calls policy` and `calls opt-outs` read and change that
policy and require an organization API key (`POLYMORFA_API_KEY` or a profile).
A project token used as the API key reaches the API, which refuses it with
`403` (exit code 3). A client token is not a Platform credential, so the CLI
refuses the command before sending a request (exit code 2).

```shell
polymorfa calls policy get
polymorfa calls policy set --blocked-country-codes 44,1876 --expected-revision 3
polymorfa calls policy set --clear --expected-revision 4

polymorfa calls opt-outs list --paginate --max-items 1000 --json
polymorfa calls opt-outs list --phone-number +14155550123
polymorfa calls opt-outs add --phone-number +14155550123 --note "Asked by phone"
polymorfa calls opt-outs add --bsuid US.13491208655302741918
polymorfa calls opt-outs import do-not-call.csv
polymorfa calls opt-outs remove 0b9f6a52-8f0e-4a44-9d51-3c1f9d6f2a10 --yes
```

- **Do-not-call list.** Calls to a listed phone number or BSUID are refused
  with `call_recipient_opted_out`, including calls a PBX places through a SIP
  trunk. Adding someone already listed returns their entry unchanged with
  `metadata.status` 200 instead of 201. The list holds 100,000 entries; a full
  list fails with `call_opt_out_limit` and exit code 4. `remove` needs `--yes`.
- **List paging.** `calls opt-outs list` returns one page. Human output ends
  with the `--cursor` for the next page. `--paginate` follows the cursor and
  requires `--max-items`.
- **Blocked country codes.** `calls policy set` replaces the stored list with
  country calling codes or longer dialing prefixes of 1 to 4 digits (`44`,
  `1876`), at most 300; `--clear` allows every country. Calls to a number that
  starts with a blocked code are refused with `call_destination_blocked`, and
  while any code is blocked, so are calls to a person whose phone number is not
  known. `--expected-revision` applies the change only if the policy still has
  the `revision` that `calls policy get` printed; otherwise the command exits
  with code 4 (`state_conflict`) and changes nothing.
- **Import.** `calls opt-outs import` reads a CSV or JSON file, or `-` for
  standard input with `--format`. CSV needs a header row naming `phoneNumber`,
  `bsuid`, and optionally `note`. JSON is an array of
  `{"phoneNumber" | "bsuid", "note"}` objects, or an object with that array as
  `entries`. The CLI sends 5,000 entries per request and reports the entries
  added, already listed, and rejected, with each rejected entry's zero-based
  position and CSV line. Running the import again is safe. It exits with code
  12 when entries were rejected, or when a later request failed after earlier
  batches were stored; when nothing was stored it exits with the request's own
  code.

Call permissions apply to Cloud API sessions and need a server API key:

```shell
polymorfa calls permission get +14155550123 --session support
polymorfa calls permission request +14155550123 --session support \
  --body "We would like to call you about order 1522."
polymorfa calls check +14155550123 --session support
```

- **Read.** `calls permission get` asks WhatsApp on every request and prints
  the status (`none`, `temporary`, `permanent`, `revoked`), its expiry, and
  WhatsApp's limits on permission requests and calls. When WhatsApp cannot be
  reached it prints the stored state and says so. A linked-device session exits
  with code 4 (`unsupported_for_connection`).
- **Ask.** `calls permission request` sends `callPermissionRequest` content
  through the messages send route, so WhatsApp shows `--body` above its allow
  and decline buttons and charges it as a message. The answer arrives as a
  `call.permission_changed` event. WhatsApp limits how often a number can ask
  the same person: the command then exits with code 5
  (`call_permission_request_limited`) and prints the `Retry-After` wait when
  WhatsApp gives one. A person who already granted permanent permission exits
  with code 4 (`call_permission_granted`). `--idempotency-key` identifies a
  retry of the same send.
- **Check.** `calls check` runs the checks a placement runs without calling:
  the session's calling switch, the do-not-call list and blocked country codes,
  and on Cloud API sessions the person's permission and WhatsApp's call limits.
  It exits with code 0 whether or not the call is allowed; read `allowed` and
  `refusal` from the output. `refusal` is `calls_disabled`,
  `call_recipient_opted_out`, `call_destination_blocked`,
  `call_permission_required`, or `call_limit_reached`.

### Call statistics and export

`calls stats` summarizes calls and `calls export` writes call detail records.
Both accept an organization API key or an exact-project token with the
`sessions:read` scope. Pass `--project` to read one project. Without it, an
organization API key reads every project in the organization. A project token
reads only its own project and requires `--project`.

```shell
polymorfa calls stats
polymorfa calls stats --project 018f0000-0000-7000-8000-000000000002 \
  --group-by session
polymorfa calls stats --since 2026-09-01T00:00:00Z --until 2026-09-02T00:00:00Z \
  --group-by hour --timezone Europe/Lisbon --heatmap

polymorfa calls export --since 2026-09-01T00:00:00Z --output calls.csv
polymorfa calls export --format ndjson --outcome missed > missed.ndjson
polymorfa calls export --max-pages 1 --limit 100
polymorfa calls export --since 2026-09-01T00:00:00Z --cursor <cursor> \
  --output rest.csv
```

Both commands filter with `--session`, `--direction` (`inbound` or
`outbound`), `--upstream` (`linked_device` or `cloud_api`), `--outcome`
(`answered`, `missed`, `declined`, `failed`, or `in_progress`), `--since`, and
`--until` (RFC 3339 times; a call matches by its start time).

- **Statistics.** The range defaults to the last 7 days. `--group-by` accepts
  `day` (the default, up to 366 days), `hour` (up to 31 days), `session`, or
  `outcome`. Day and hour groups, and the `--heatmap` grid of calls by day of
  week and hour, use `--timezone`, an IANA name such as `Europe/Lisbon` (UTC by
  default). Human output prints the totals, with the answer rate as a
  percentage and durations as hours, minutes, and seconds, and then one row per
  group. `--json` prints the complete response, including the heatmap. Grouping
  by session lists at most 500 numbers; the totals still count every call.
- **Export.** `--format` is `csv` (the default) or `ndjson`. The command requests
  pages of `--limit` records (1 to 1,000; default 1,000), newest first, until
  none remain, and writes one CSV header. Records go to standard output, or to
  the `--output` file, which must not exist unless you pass `--force`. The file
  is created, or emptied with `--force`, when the first page arrives, even if
  no records match. Progress,
  the final summary, and the next cursor go to standard error, as JSON lines
  with `--json`. `--max-pages` stops early and prints the cursor for the rest;
  `--cursor` resumes from it with the same filters. If a page fails, the
  command keeps the records already written, prints the cursor that resumes
  from the failed page, and exits with the API error's exit code. The other
  party appears only as `peerRef`, a team-specific pseudonym, never a phone
  number.

### SIP trunks

`sip-trunk view` displays a null `outbound.fromUser` as automatic caller
identity. Set `outbound.fromUser` in your trunk JSON when your PBX needs a fixed
From user.

SIP trunks connect a PBX to WhatsApp calls. They are part of Calls and need no
enrollment. Commands require a server API key.

```shell
polymorfa sip-trunk endpoint
polymorfa sip-trunk list --project 018f0000-0000-7000-8000-000000000002
polymorfa sip-trunk view 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10
polymorfa sip-trunk create --project 018f0000-0000-7000-8000-000000000002 --input trunk.json
polymorfa sip-trunk update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 \
  --disable --expected-revision 3
polymorfa sip-trunk update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --input changes.json
polymorfa sip-trunk rotate-credentials 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --yes
polymorfa sip-trunk delete 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --yes
```

`create` and `update` read the request body from a file or stdin (`-`), so
passwords never appear in the command line. `create` refuses a body that names
`projectId`; use `--project`. A trunk that accepts calls from your PBX, and
`rotate-credentials`, print the password once. `update --expected-revision`
exits with code 4 when the trunk changed; `delete` exits with code 4 while a
session routes calls to the trunk.

`endpoint` prints the host your PBX sends SIP to, each transport with its port
and whether it requires SRTP, and the UDP port range call audio uses. The
address is the same for every trunk. Allow SIP and RTP in both directions
between your PBX and the addresses the host resolves to. When the environment
does not host SIP, `endpoint` prints `This environment has no SIP address.`
and exits with code 0; `--json` returns the `sip_not_hosted` status with a null
host and RTP range and no transports. `create` and `rotate-credentials` also
print the password before looking up the SIP address in human output. The
optional address lookup stops after five seconds without retrying and respects
a shorter `--timeout`. If it fails
or times out, the command keeps the password on screen and exits successfully.

## Voice Automation (beta)

Voice Automation is a beta (`calls.voice-automation`) for enrolled teams only.
For other teams, every change except delete fails with `voice_not_enabled`.
Reads, previews and deletes keep working after a team leaves the beta. The
commands require an organization server API key with `voice:read` (lists,
views, previews) or `voice:manage` (changes).

### Audio library

The audio library holds recordings and text-to-speech renders for calls. The
API transcodes each asset to 16 kHz mono; an asset is `transcoding` until it is
`ready` or `failed`.

```shell
polymorfa voice audio upload greeting.mp3 --name Greeting \
  --project 018f0000-0000-7000-8000-000000000002 --wait
polymorfa voice audio tts --name Welcome --text "Thanks for calling." \
  --provider openai --voice alloy \
  --project 018f0000-0000-7000-8000-000000000002
polymorfa voice audio list --status ready \
  --project 018f0000-0000-7000-8000-000000000002
polymorfa voice audio view 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10
polymorfa voice audio update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 \
  --name "Greeting v2" --retention-days none --expected-revision 2
polymorfa voice audio preview 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 \
  --output greeting.ogg
polymorfa voice audio delete 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --yes
```

- `upload` takes `.mp3`, `.wav`, `.ogg`, `.opus`, `.m4a` and `.mp4` files up to
  16 MB and sets the content type from the extension. Other types, empty files
  and larger files fail with exit code 2 before any request is sent. The file
  goes to a short-lived upload URL that carries no credential.
- `tts` reads the text from `--text` or `--text-file` (`-` for stdin): 1 to
  5000 characters, or 4096 for `openai`. `--voice` is an OpenAI voice name or
  an ElevenLabs voice ID. `--model` defaults to the provider's default model.
  Unsupported OpenAI voices and provider-specific models fail with exit code 2
  before any request is sent.
  Without `--credential`, the render uses Polymorfa's managed key for the
  provider.
- `upload --wait` and `tts --wait` wait until the asset is `ready` (exit 0) or
  `failed` (exit 13, with the failure reason). `--wait-timeout` defaults to 120
  seconds and exits with code 5 when reached, including when a status request
  stalls. This budget starts after upload or TTS submission and covers status
  requests, response bodies, and retries.
- `--retention-days` deletes the asset that many days after creation (1 to
  3650). `update --retention-days none` keeps it until you delete it.
- `preview` prints a link to the transcoded audio (Opus in Ogg). The link works
  for 5 minutes; treat it as a secret. `--output` downloads it instead and
  refuses an existing file unless `--force` is given. With `--output`, JSON
  results omit the signed link. Storage refusals retain the HTTP status but
  omit the signed link and storage response text.
- `delete` asks for confirmation, or takes `--yes`, and exits with code 4 while
  a campaign or flow uses the asset.

### Provider credentials

Store your own ElevenLabs or OpenAI key to render text to speech with it. The
CLI never takes the key from an argument. It reads the environment variable
named by `--key-env` (default `POLYMORFA_VOICE_PROVIDER_KEY`) or, when that is
unset, piped standard input, and it refuses to read the key from a terminal:

```shell
printf '%s' "$ELEVENLABS_API_KEY" | \
  polymorfa voice credential add --provider elevenlabs --label "Studio key"
polymorfa voice credential add --provider openai --label "Support line" \
  --key-env OPENAI_API_KEY --project 018f0000-0000-7000-8000-000000000002
polymorfa voice credential list --project 018f0000-0000-7000-8000-000000000002
polymorfa voice credential view 7a2d3e4f-5b6c-4d7e-8f90-1a2b3c4d5e6f
polymorfa voice credential verify 7a2d3e4f-5b6c-4d7e-8f90-1a2b3c4d5e6f
polymorfa voice credential delete 7a2d3e4f-5b6c-4d7e-8f90-1a2b3c4d5e6f --yes
```

Without `--project`, the credential is available to every project of the team.
Output shows only the key's fingerprint (the first 8 hex characters of its
SHA-256). The provider checks the key when it is added and on `verify`; a
rejected key fails with `provider_credential_invalid` (exit code 2).

### Voice exit codes

| Exit code | Error code                                                               | Meaning                                                 |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| 6         | `voice_not_enabled`                                                      | The team is not enrolled in the Voice Automation beta.  |
| 7         | `gate_limit_reached`                                                     | A voice limit is reached.                               |
| 13        | `voice_asset_failed`                                                     | Audio awaited with `--wait` failed processing.          |
| 4         | `voice_asset_in_use`, `voice_asset_revision_conflict`, `asset_not_ready` | The asset is in use, changed, or not ready.             |
| 2         | `provider_credential_invalid`, `invalid_parameter`                       | The provider rejected the key, or the input is invalid. |
| 5         | `provider_unavailable`, `voice_unavailable`                              | The provider or voice service did not answer.           |

Other errors keep the standard exit codes: 2 for invalid input, 3 for
authentication and authorization, 4 for conflicts, missing resources and other
payment errors, and 5 for network, rate-limit, server and timeout failures.
With `--json`, stderr carries the error code in `error.code`.

### Call usage and limits

When Calls access is enabled for a team, Polymorfa measures the calls its numbers host. Usage is measured, not charged.
Commands require `sessions:read`; a project token reads only its own project's
usage and needs `--project` or a project-bound profile. `usage gates` needs a
team API key, because gate state covers the whole team.

```shell
polymorfa usage summary
polymorfa usage summary --period 2026-09 --session support
polymorfa usage records --call 3EB0C431C26A1916E07A
polymorfa usage records --session support --meter call.duration --limit 50
polymorfa usage records --session support --cursor <cursor from the last page>
polymorfa usage gates --session support
```

`usage summary` totals one calendar month (UTC) by meter and by number, and
defaults to the current month; without `--project`, each number row also shows
its project. `usage records` lists records newest first with each record's
project, and prints the cursor for the next page. `usage gates` shows each gate's mode,
limit, usage this month and how often an action went over the limit in the last
30 days: in `record` mode nothing is refused, and in `enforce` mode an action
over the limit exits with code 4 (`gate_limit_reached`).

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

## BanSafe

Inspect current and historical Health, the bounded signal catalogue, collected
telemetry, collection evidence, and durable Health actions with a Platform
server API key:

```shell
polymorfa bansafe health list --project project_123
polymorfa bansafe health view session_123
polymorfa bansafe health history session_123 --since 2026-09-01T00:00:00Z
polymorfa bansafe signal list
polymorfa bansafe telemetry view session_123
polymorfa bansafe telemetry history session_123 --limit 20
polymorfa bansafe collection list --project project_123
polymorfa bansafe health-action list --project project_123 --status failed
polymorfa bansafe health-policy view --project project_123
polymorfa bansafe health-policy update \
  --project project_123 \
  --input health-policy.json \
  --idempotency-key health-policy-v4
polymorfa bansafe finding list --project project_123 --status open
polymorfa bansafe enforcement list --project project_123
polymorfa bansafe incident list --project project_123
polymorfa bansafe incident report \
  --session session_123 \
  --idempotency-key customer-incident-123
polymorfa bansafe incident retract incident_123 \
  --idempotency-key retract-incident-123
polymorfa bansafe claim list --project project_123
polymorfa bansafe claim view claim_123
polymorfa bansafe safe-mode view --project project_123
polymorfa bansafe safe-mode view session_123
polymorfa bansafe safe-mode update --project project_123 \
  --input safe-mode.json --idempotency-key safe-mode-v2
polymorfa bansafe warmup view --project project_123
polymorfa bansafe warmup update --project project_123 \
  --input warmup.json --idempotency-key warmup-v2
polymorfa bansafe insurance-evidence view --project project_123
polymorfa bansafe insurance-evidence update --project project_123 \
  --input insurance-evidence.json --idempotency-key insurance-evidence-v2
```

Collection output reports observed ingestion state: `fresh`, `stale`,
`not_collected`, or `unsupported`. It does not infer whether collection is
configured. Telemetry history returns bounded snapshots and explicit
per-signal measurement state. Missing signals are not reported as healthy
measurements.

Health policy updates replace the complete policy and require its current
version. The CLI validates action and notification combinations before sending
the request. Health policy, Safe Mode, warmup, and insurance-evidence updates
require an idempotency key. Safe Mode and warmup updates accept bounded JSON
patches. Customer incident reports and retractions also require an idempotency key. Finding
acknowledgement and enforcement appeals remain dashboard-only and are not
available through server-key commands. Claim `amountCents`, `measuredCents`, and
`capCents` are credit quantities with up to six decimal places, not cash minor
units; text output labels them as credits. Use `--json` to retain explanations,
observed account state, collection metadata, action outcomes, cursors, and
request metadata.

## Platform access and security

Organization server API keys can inspect the credential, membership, audit,
ban, incident, saved QuickLink settings, and project-token metadata made
available by the Platform API:

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
listing requires one explicit project ID. Follow asynchronous work with the
`operation` commands described in [Operations](#operations).

Member invite, role update, and removal remain dashboard-session routes and are
not exposed through server-key commands. The API also exposes no compatible
API-key creation, token mint/revoke, incident detail, or cross-project token
aggregate in this typed slice. The raw API command is not a credential-boundary
bypass.

`widget view` and `widget update` manage saved QuickLink settings. View
returns `null` in JSON when no settings row has been saved. Update
accepts one bounded JSON object from `--input`; the target project is selected
separately with `--project` and cannot be hidden in that input. Omitting the
project targets organization defaults. Widget logo fields are existing storage
identifiers, not file, URL, base64, upload, or download operations. Widget
access requires the `quicklink:manage` scope.

Settings accept `successCallbackUrl` and `failureCallbackUrl`: project-only
HTTPS destinations that the API copies into each link when it is issued. Set
`allowPhoneChange` to `true` to let recipients replace a prefilled number; the
default is `false`. `hideWatermark: true` requires Premium team access. Settings
have no redirect-URI allowlist. Human output shows both callback URLs and the
phone-change policy.

```json
{
  "successCallbackUrl": "https://app.example.com/whatsapp/connected",
  "failureCallbackUrl": "https://app.example.com/whatsapp/cancelled",
  "allowPhoneChange": false
}
```

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

Launch, pause, and resume return accepted durable work; they do not wait for
the state transition. Stop returns accepted work for an active delivery run,
or reports an immediate cancellation with no operation ID when none is active.
Check the campaign with `polymorfa campaign view`. When an operation ID is
returned, follow it with `polymorfa operation wait` or
`polymorfa operation watch`; see [Operations](#operations).

Stop is terminal and requires `--yes`. A campaign that has an active delivery
run answers with an operation ID, as the other lifecycle commands do. A
campaign with no active run is cancelled immediately and answers without one;
the CLI reports that outcome instead of printing an empty operation.

Launch times accept epoch milliseconds or timezone-qualified ISO 8601
instants. List returns one complete newest-first array with no cursor. Requeue
is synchronous and reports only the number moved.

Create, launch, pause, resume and stop accept `--idempotency-key` to deduplicate
the same request for 24 hours. A successful request repeated with the same key
returns `409 idempotency_completed`, not the original response. Changed input
returns `409 idempotency_conflict`; an in-progress or uncertain result must be
resolved before trying a new key. The SDK generates a fresh key for create and
launch when the flag is omitted. Supply an explicit key from the first attempt
to reuse it across CLI invocations with the same input, credential and API
version. Save the first campaign or operation response and inspect campaign
state before using a new key. Pause, resume and stop persist an explicit key;
they do not generate one when the flag is omitted.

Requeue also accepts the header, but the API does not deduplicate it. Each
invocation moves recipients eligible at that time, so a retry can move newly
failed recipients rather than returning the first result.

### Campaign recipients

Recipients are appended to a campaign that has not started sending, and read
back one cursor page at a time:

```shell
polymorfa campaign recipients add campaign_123 \
  --project-slug launch-project \
  --csv contacts.csv \
  --phone-column Phone \
  --variable "firstName=First name"

polymorfa campaign recipients add campaign_123 \
  --project-slug launch-project \
  --input recipients.json

polymorfa campaign recipients list campaign_123 \
  --project-slug launch-project \
  --status skipped \
  --limit 100
```

One append accepts at most 1,000 entries. `--csv` reads the file locally and
sends the rows inline; it does not upload the file. Blank rows are ignored, but
a row with other values and an empty phone cell stops the command before
anything is sent, naming the row numbers (the header is row 1). `--input`
entries with an empty phone, and any phone longer than 64 characters, are
refused the same way, as is an empty `--input` array, because the API would
reject the whole request. JSON variables must use valid names and string values;
CSV and JSON variable values are limited to 1,024 characters. Reported invalid
rows for `--csv` refer to the
original spreadsheet rows, including blank rows. `__proto__` is not accepted as a `--variable` name. Comma,
semicolon and tab separators are detected from the header row; separators
inside quoted fields are ignored. A phone already on the
campaign is skipped, and invalid entries are reported rather than added, so the
result carries `added`, `duplicateCount`, `invalidCount` and up to 20
`invalidRows`.

The API does not replay an append, so the CLI sends it once and never retries
it automatically, with or without `--idempotency-key`. A resent append would
count the first attempt's rows as duplicates. If a connection drops before the
result arrives, list the recipients before appending again.

List returns `{data, page}`. Pass `page.nextCursor` back as `--cursor` while
`page.hasMore` is true; the CLI prints the next cursor in human output. Filter
with `--status queued|sending|sent|delivered|read|failed|skipped`. A recipient
suppressed by an opt-out appears as `skipped` with `lastError` `opted_out`.

The source exposes no campaign update, delete, validate, archive, duplicate,
event, history, or replay route on the Messaging surface. The CLI does not
substitute similarly named Platform campaign methods for these gaps. To follow
or stop a campaign's operation, use the `operation` commands in
[Operations](#operations).

## Campaign audiences

Audience commands are organization-scoped and use the Platform API:

```shell
polymorfa audience create --name "August launch" \
  --csv contacts.csv \
  --phone-column Phone \
  --variable "firstName=First name"

polymorfa audience create --name "August launch" \
  --file-id upload_1 \
  --mapping mapping.json

polymorfa audience members add list_123 --csv contacts.csv
polymorfa audience members list list_123 --limit 100
polymorfa audience members remove list_123 +15551234567
```

`--csv` sends up to 1,000 members inline. `--file-id` imports a file that was
already uploaded through the API and needs `--mapping`, a JSON document naming
the phone column and any variable columns:

```json
{"phone": "Phone", "variables": {"firstName": "First name"}}
```

Creation and appends report the same import counts as campaign recipients, so a
caller can reconcile what was accepted. Like recipient appends, `members add` is
sent once and never retried automatically. Member listing is cursor-paged like
recipient listing.

## Campaign opt-outs

Opt-out suppression is organization-wide. Keyword capture has its own settings:

```shell
polymorfa optout settings view
polymorfa optout settings update \
  --enabled \
  --opt-out-keyword STOP \
  --opt-out-keyword BAJA \
  --opt-in-keyword START
polymorfa optout settings update --no-enabled --opt-out-keyword STOP
```

Update replaces the whole settings document, so pass the complete keyword set
every time; the CLI refuses a partial update rather than clearing keywords the
caller did not mention. At least one opt-out keyword is required even when
capture is off. When capture is on, a matching reply suppresses the contact and
the API emits `contact.opted_out`; an opt-in keyword emits `contact.opted_in`.
A suppressed contact is skipped at dispatch, which is visible as a `skipped`
recipient with `lastError` `opted_out`.

## Developer events and webhooks

Developer resources always have an explicit owner. Project-owned commands need
`--owner project --project <id>`. Organization-owned commands use
`--owner organization` and reject a project override. A stored profile can
provide the owner, but the CLI never guesses it from a credential or retries a
request against a different owner.

```shell
polymorfa event list \
  --owner project \
  --project project_123 \
  --type message.received

polymorfa event view event_123 \
  --owner project \
  --project project_123 \
  --include-payload

polymorfa webhook create \
  --owner project \
  --project project_123 \
  --input webhook.json \
  --secret-out ./webhook.secret

polymorfa webhook test webhook_123 \
  --owner project \
  --project project_123 \
  --event polymorfa.test

polymorfa webhook delivery list \
  --owner project \
  --project project_123 \
  --status failed

polymorfa webhook delivery attempt list delivery_123 \
  --owner project \
  --project project_123
```

Webhook creation and secret rotation return a signing secret once. JSON and
noninteractive runs require `--secret-out`; the CLI preflights a new path and
writes it atomically with mode `0600`. Interactive runs can reveal the secret
once on the terminal. The secret never appears in JSON, MCP output, debug
messages, profiles, or command arguments. A server success followed by a local
write failure exits with `partial_success` and retains the safe mutation
receipt. It never retries rotation on its own.

List commands return opaque cursors. `--paginate` requires `--max-items`, which
is capped at 10,000. The CLI shrinks the last request to the remaining item
budget instead of fetching records it will discard.

Replay, delivery retry, and webhook test return an idempotency receipt and an
operation ID in the JSON `operation.id` field. Follow it with
`polymorfa operation wait <id>`, or use `webhook delivery view` and
`webhook delivery attempt list` to follow the resulting delivery.

## Operations

Campaign sends, production enrollments, and other durable work are tracked as
operations. The commands need `operations:read`; `operation cancel` needs
`operations:cancel`. With `--owner organization`, commands read team-owned
operations and every project's operations. With `--owner project`, they read
one project.

```shell
polymorfa operation list --owner organization --status running
polymorfa operation list --owner organization \
  --resource-type campaign --resource-id campaign_123
polymorfa operation view operation_123 --owner organization
polymorfa operation wait operation_123 --owner organization --timeout 600
polymorfa operation watch operation_123 --owner organization
polymorfa operation cancel operation_123 --owner organization --yes
```

`operation wait` long-polls the API (up to 30 seconds per request) until the
operation succeeds, fails, or is cancelled. It exits `0` on success, `1` on
failure or cancellation, and `8` when `--timeout` (default 300 seconds) ends
first. `operation watch` prints each status change as it happens, one JSON
document per change with `--json`, and exits the same way.

`operation cancel` works only while `capabilities.cancellable` is true (running
or action-required campaign and production-enrollment operations). It requires
`--yes` in noninteractive runs and accepts `--idempotency-key`; a retry with the
same key returns the original receipt. Other operations fail with a conflict
that includes the current operation.

`event view` prints the retained payload in human output only with
`--include-payload`. `webhook delivery attempt view` prints the redacted
response excerpt that the API records for a failed HTTP response. Human output
escapes control characters in remote text.

### Stream events

`polymorfa event stream` follows a project's public event stream and prints
each event as it happens. It needs a credential with `events:listen` and a team
enrolled in the Event streams beta; otherwise it exits with the authorization
code.

```shell
polymorfa event stream \
  --owner project \
  --project project_123 \
  --type 'message.*' \
  --json
```

`--json` writes one JSON line per event with its `cursor`, the event metadata,
and the decoded webhook body (`null` when hosted message storage did not keep
it). Human output prints the time, type, ID, and body, and prints a
`--from <cursor>` hint on exit. Pass `--from` to resume within 24 hours. The
command reconnects with backoff after a dropped connection. If events after
`--from` expired before delivery, it reports the count and continues; use
`--on-gap stop` to exit with the stream gap code instead. `--max-events` stops
after a fixed number of events.

Ctrl-C or SIGTERM stops the stream with exit code 0. If the output pipe is
blocked, stopping discards queued output instead of waiting for the reader.

Use `event stream` to consume events in a script. Use `listen` to forward exact
bodies to a local webhook handler.

## Local event listening and forwarding

`polymorfa listen` opens the project listener stream and can forward the exact
event body to local webhook handlers:

```shell
polymorfa listen \
  --project project_123 \
  --event 'message.*' \
  --forward-to http://127.0.0.1:3000/webhooks \
  --forward-secret-out ./local-forwarding.secret \
  --checkpoint-file ./.polymorfa-listener-checkpoint
```

The CLI signs forwarded bodies with a separate local secret. Remote forwarding
is disabled unless `--allow-remote-forward` is set. Redirects are disabled by
default; explicit redirect following revalidates each hop. The listener writes
checkpoints only after stdout and every forwarding destination have accepted an
event. A cursor gap stops with a nonzero exit unless `--on-gap continue` was
selected.

## Trigger test events

`polymorfa trigger` sends a signed test event for a Test number. The event
reaches your webhooks, event history, and a running `polymorfa listen` with
`source: "test"`, and does not change the Test number. Real numbers are
refused. Each project can trigger 30 test events per minute. It requires a
server API key with `sandbox:write` (`sandbox:read` for `--list`) and Test
numbers access.

Run a listener in one terminal:

```shell
polymorfa listen --project PROJECT_ID --forward-to http://127.0.0.1:3000/webhooks
```

Trigger events in another:

```shell
polymorfa trigger --list --project PROJECT_ID
polymorfa trigger message.received --project PROJECT_ID --session my-test-number --text "hi"
polymorfa trigger message.received --project PROJECT_ID --session my-test-number \
  --override mediaType=image --override caption=look
polymorfa trigger message.ack --project PROJECT_ID --session my-test-number --override ackStatus=read
polymorfa trigger message.failed --project PROJECT_ID --session my-test-number
polymorfa trigger call.received --project PROJECT_ID --session my-test-number --override video=true
polymorfa trigger session.restriction_updated --project PROJECT_ID --session my-test-number \
  --override restrictionActive=false
polymorfa trigger template.status --project PROJECT_ID --session my-test-number \
  --override templateStatus=REJECTED --override reason=INVALID_FORMAT
```

The trigger prints the event ID. Without `--forward-to`, the listener prints
the same line (`message.received <eventId>`) when the event arrives; with
`--forward-to`, it prints nothing on success unless you add `--json` together
with `--forward-secret-out <file>` (JSON forwarding requires the secret file),
which writes one JSON line per event. Fixtures are
`message.received`, `message.ack`, `message.failed`, `call.received`,
`call.missed`, `call.ended`, `session.status`, `session.restriction_updated`,
and `template.status`. `--override key=value`
sets one payload field and can be repeated; `--text` and `--from` are
shortcuts. `video` and `restrictionActive` accept only `true` or `false`;
`durationSeconds` accepts a whole number. Set `restrictionActive=false` to
test the end of a restriction. `--from-session OTHER_TEST_NUMBER` sends a real simulated text from
another Test number in the project instead, producing an ordinary
`message.received` event you can reply to. Use `--json` for one JSON document.

## MCP listener controls

The package includes a standards-based stdio MCP server for Codex and Claude:

```shell
polymorfa mcp install codex
polymorfa mcp install claude
polymorfa mcp status
polymorfa mcp tools
polymorfa mcp doctor
```

The MCP tools `polymorfa_listen_start`, `polymorfa_listen_status`, and
`polymorfa_listen_stop` control listeners inside that stdio server process.
They do not create detached daemons. MCP responses contain listener IDs,
status, and safe counters, never primary credentials, listener credentials,
forwarding secrets, or unrestricted payloads.

## Agent skills

The npm package includes two portable skills under `skills/`:

- `polymorfa` establishes profile, owner, project, JSON, and mutation-safety
  conventions for CLI and MCP use.
- `polymorfa-webhooks` covers event inspection, webhook testing, replay and
  retry, local listening and forwarding, and one-time secret handling.

Copy or link the relevant skill directory into the skills folder used by your
agent host. The skill treats the installed command help as authoritative, so it
stays useful as the command surface grows without teaching agents to invent
routes or use raw requests for missing typed developer operations.

## Raw API requests

`polymorfa api` is the complete-access escape hatch inspired by `gh api`. It
uses the public Polymorfa SDK for credential validation, HTTP transport,
timeouts, retries, error typing, request IDs, and response decoding.

Set credentials through the environment, never a command argument:

```shell
export POLYMORFA_API_KEY='pmfa_...'
polymorfa api /v1/projects --surface platform --json
```

Messaging accepts exactly one of `POLYMORFA_API_KEY`, `POLYMORFA_PROJECT_TOKEN`,
or `POLYMORFA_CLIENT_TOKEN`. Project tokens remain confined to their project;
individual commands enforce their credential requirements. Raw Platform requests
accept only `POLYMORFA_API_KEY`. Supplying multiple Messaging credentials fails
before a request is sent. For a project-token profile, `--project` or the
nearest `polymorfa.json` must match the profile's project. Raw requests with an
API key or client token do not read the directory link.

Examples:

```shell
polymorfa api /v1/projects --surface platform

polymorfa api /v1/campaigns \
  --surface platform \
  -X POST \
  -f projectId=project_123 \
  -f name='August launch' \
  -F dryRun=true \
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
is capped at 10 MiB. Use `-H/--header name:value` for additional headers and
`-i/--include` to include response metadata in human output. `-X` is short for
`--method`.

### Fields

- `-f/--raw-field name=value` always sends a string.
- `-F/--field name=value` converts `true`, `false`, `null`, and integers to JSON
  values. `@path` reads a file and `@-` reads standard input as a string.
  Anything else stays a string.
- Both accept `name[key]=value` to build nested objects and `name[]=value` to
  append to an array. GET and HEAD query parameters accept values and `name[]`
  arrays but not nested objects.

`--field` previously sent every value as a string. Use `-f` where a value such
as `10` or `true` must stay a string.

### Pagination and output filters

```shell
# Every page, one ID per line
polymorfa api /platform/customers --surface platform --paginate --jq '.data[].id'

# All pages as one array, then one jq program over it
polymorfa api /platform/customers --surface platform --paginate --slurp \
  --jq 'map(.data | length) | add'

# Go-style template
polymorfa api /platform/customers --surface platform \
  --template '{{range .data}}{{.id}}{{"\t"}}{{.name}}{{"\n"}}{{end}}'
```

- `--paginate` (GET only) follows `page.nextCursor` by sending it back as the
  `cursor` query parameter until the cursor is null or `hasMore` is false. It
  stops with an error after `--max-pages` pages (100 by default) and when the
  API returns the same cursor twice. Without a filter, human output prints each
  page as it arrives; `--json` prints one document whose `data` is the array of
  page bodies and whose `metadata.pages` is the page count.
- `--slurp` requires `--paginate` and combines the page bodies into one array
  before `--jq` or `--template` runs. Without `--slurp`, filters run on each page.
- `-q/--jq` runs a jq 1.8 program with an embedded WebAssembly jq, so no `jq`
  binary is required. Strings print without quotes. The jq runtime has its own
  environment, so `$ENV` does not expose your shell variables or credentials.
- `-t/--template` renders a Go-style template: `{{.path.to.value}}`,
  `{{range .list}}…{{else}}…{{end}}`, `{{if .value}}…{{else}}…{{end}}`,
  `{{$.root}}` inside a range, `{{json .x}}`, `{{len .x}}`, `{{upper .x}}`,
  `{{lower .x}}`, `{{join ", " .list}}`, string literals such as `{{"\n"}}`,
  comments, and `{{-`/`-}}` whitespace trimming. Missing values render as an
  empty string.
- `--jq`, `--template`, and `--json` are mutually exclusive, as are `--include`
  and a filter.

`--json` prints exactly one JSON document on stdout. `--quiet` suppresses
successful output without hiding failures. Diagnostics and errors go to stderr;
SDK request IDs are preserved and active credentials are redacted.

An API failure prints the message, then the request ID, the Console request
log link, and the documentation link for the error code when the API returned
them:

```text
Error: WhatsApp is limiting requests from this number. Follow Retry-After when supplied.
Request ID: 5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30
Request log: https://www.polymorfa.com/console/acme/support-bot/logs/api?request_id=5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30
Docs: https://docs.polymorfa.com/api/errors#whatsapp-rate-limited
```

With `--json`, the stderr error envelope carries the same values as
`error.requestId`, `error.requestLogUrl`, and `error.docUrl`. The request log
link is returned only for team API keys and project tokens.

`POLYMORFA_BASE_URL` exists only for development and controlled testing. It
overrides a profile endpoint and must not be placed in project files.

The raw command does not bypass owner, principal, or scope boundaries. Events,
webhooks, deliveries, and attempts use their typed commands; the CLI does not use `api` to synthesize a missing developer
workflow.

## Verification

```shell
npm run verify
```

The verification gate checks formatting, lint, strict TypeScript, tests,
production build, npm package contents, and the production dependency audit on
Node.js 22 in hosted CI.

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

### Hybrid Link controls

These additions are under development and are not available in the published
CLI. They are tested against the companion Hybrid Link SDK source using API
contract `d5245f76d5d6bc7b9af439571bd1f157185b1b87`. The registry SDK dependency
must be updated after that SDK artifact is published before releasing this CLI.
The companion SDK defaults native requests to API revision `2026-09-22`. An
explicit `--api-version` or saved-profile version remains explicit; retired
versions fail without an automatic upgrade or resend.

These commands require API-authorized private-preview access. An installed CLI
or a transport flag does not enable Hybrid Link. Use a team API key or project
token through `POLYMORFA_PROJECT_TOKEN` or a project-token profile. Project tokens
can control only their project and its Numbers; team routing policies require a
team API key. Browser client tokens cannot control Hybrid Link or send through it.

```bash
polymorfa quicklink availability --project PROJECT_UUID --session NUMBER
polymorfa quicklink create --project PROJECT_UUID --connection-goal hybrid
polymorfa quicklink create --project PROJECT_UUID --purpose add_connection --session NUMBER --add-connection linked_devices
polymorfa message send text --session NUMBER --to +14155550123 --body Hello --transport official_api
polymorfa message operation-status OPERATION_UUID --session NUMBER
polymorfa routing-policy get --scope session --project PROJECT_UUID --session NUMBER
polymorfa routing-policy set --scope session --project PROJECT_UUID --session NUMBER --expected-revision REVISION --prefer linked_devices --allow linked_devices --allow official_api
polymorfa hybrid-link state --session NUMBER
polymorfa hybrid-link pause --session NUMBER --expected-revision REVISION
polymorfa hybrid-link resume --session NUMBER --expected-revision REVISION
```

For project and session routing scopes, `--project`, the nearest linked project,
and the selected profile determine the project in that order. A project-token
profile fails when its project differs from the linked directory. Team routing
scope uses an organization API key and ignores directory project links. `quicklink
availability` shows existing connection status and any QuickLink that can be
resumed.

All message send types, reactions, edits, and deletions accept `--transport auto`,
`linked_devices`, or `official_api`. Explicit choices never fall back. JSON output
preserves route metadata and the operation ID. If a send reports an unknown
outcome, inspect `message operation-status`; do not resend with a new key or change
transport. Status reads do not send. `pending` and `unknown` are unresolved outcomes.
`rejected` means the runtime proved it denied the send before a provider attempt.
Fix the access or routing cause before creating a new operation with a new
idempotency key. The rejected operation itself cannot be resumed.

Policy writes require the revision returned by `routing-policy get` (`default`
for an unsaved policy). Pause/resume requires the revision returned by
`hybrid-link state`. A stale write fails without replacing later changes.
`--prefer inherit` sends no local preference. `--deny-all` disallows both transports at the selected scope. Repeating `--allow` permits both
transports within the restrictions inherited from the team and project.

### Functions

Functions are project-owned. Select `--project` or use the linked project/profile context. The commands accept an organization API key or a project token; browser client tokens are refused. Access also depends on the team's enabled Functions release and the configured execution region.

```bash
polymorfa function list --project PROJECT_UUID
polymorfa function create --project PROJECT_UUID --input function.json
polymorfa function deployment create FUNCTION_UUID --project PROJECT_UUID --input deployment.json
polymorfa function invocation create FUNCTION_UUID --project PROJECT_UUID --input invocation.json --idempotency-key booking-42
polymorfa function deployment promote FUNCTION_UUID DEPLOYMENT_UUID --project PROJECT_UUID --expected-revision 1
```

`function.json` contains `name` and an optional stable `functionId`. A deployment input contains a new `deploymentId`, `source`, `language` (`javascript`, `typescript` or `visual`), `region`, `compatibilityDate`, optional `secretVersionIds` and exact HTTPS `egressOrigins`. Visual source is a JSON action program encoded as the source string. Input files do not contain `projectId` or override path IDs.

Use an origin such as `https://api.example.com` for each egress entry. Credentials, paths (including a trailing slash), queries, fragments and explicit ports are rejected before sending. The CLI preserves accepted origins exactly.

`function update FUNCTION_UUID --input update.json` takes `expectedRevision` and `name` or `enabled`. `function delete FUNCTION_UUID --expected-revision N --yes` retires the definition and leaves invocation receipts readable. Add the selected project to each command or use the linked context.

Secret values go through a JSON file or stdin, never a command-line value flag:

```bash
polymorfa function secret create FUNCTION_UUID --project PROJECT_UUID --input secret.json
polymorfa function secret list FUNCTION_UUID --project PROJECT_UUID
polymorfa function secret revoke FUNCTION_UUID SECRET_VERSION_UUID --project PROJECT_UUID --yes
```

The secret input is `{ "name": "PROVIDER_KEY", "value": "YOUR_EXTERNAL_SECRET" }`. Keep the file private. Values are write-only. Creating a new version leaves existing deployments pinned to their original version. Revocation stops new invocations that use that version; running code can finish. Polymorfa credentials cannot be stored as Function secrets.

Invocation input contains an optional `deploymentId`, `trigger` (`test` or `http`) and `request` with `method`, a synthetic URL under `https://function.polymorfa.invalid`, selected `headers` and `bodyBase64`. Every invocation requires an explicit `--idempotency-key` of 1–128 printable ASCII characters, excluding spaces. The CLI rejects invalid keys without trimming or changing them. It never retries Function writes automatically. Reusing a key returns the original receipt without executing again, including when credentials rotate; replay does not return the original response body.

Use `function invocation list FUNCTION_UUID` and `function invocation view FUNCTION_UUID INVOCATION_UUID` to reconcile a result. Invocation inputs, responses and customer log text are not retained. `--json` includes the transient result when the initial invocation returns it. The default display prints metadata and HTTP status without response content. An uncertain, failed, running or unavailable invocation, or an HTTP response of 400 or higher, exits with code 8 after printing its receipt. Check customer effects before using a new key unless `retryable` explicitly says execution did not start.

Function, deployment, secret and invocation lists accept `--limit 1..100` and `--before UUID`. Deployment lists return metadata without source, including with `--json`. `function deployment view` exposes source with `--json`; secret reads always return metadata.

### Call reaction and hand commands

`calls react CALL --connection-id CONNECTION --emoji '👍'` sends a reaction;
`--clear` clears it. `calls hand CALL --connection-id CONNECTION --raised`
raises the Number's hand; omit `--raised` to lower it. A server credential may
name `--participant`; a client token acts as its own participant. The named
connection must still be attached to the call.

These source commands require the SDK release containing `sendReaction` and
`setHandRaised`, followed by an exact registry dependency update. Until that
release is pinned, they return a specific SDK dependency error. Local package
tests do not establish published availability. Reactions are transient and
are never retried automatically. Hand state is shared by the Number's clients.

The source group-placement and participant re-ring commands also require the
matching SDK publication. Until its exact registry version is pinned, they
refuse before sending a request. Testing a local package does not establish
registry or deployed availability.

### Stored call records

```sh
polymorfa calls list --outcome missed --limit 25 --json
polymorfa calls list --outcome missed --limit 25 --cursor CURSOR --json
polymorfa calls view CALL_ID --json
```

`calls list` reads one page through the existing Calls records API. Reuse the
same filters when following a cursor. These reads need `sessions:read` and a
server credential. Project tokens only read calls originally owned by their
project. Human output labels unmeasured duration as `unknown`.

The source `calls view` command requires the SDK publication containing
`Client.calls.retrieve` and the matching API deployment. Until that exact
registry release is pinned, it reports an SDK dependency error before transport.
Its JSON output includes bounded event history, participant and connection
lifetimes, and allowlisted diagnostics. It does not retrieve media or webhook
deliveries. Local package tests do not establish published availability.
