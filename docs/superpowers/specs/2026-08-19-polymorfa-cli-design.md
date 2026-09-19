# Polymorfa CLI design

- **Status:** Living design; the accepted 2026-08-20 developer API RFC supersedes
  this document for events, webhooks, deliveries, attempts, operations, local
  listening, forwarding, and MCP listener controls
- **Repository:** `polymorfa/cli`
- **Package:** `@polymorfa/cli`
- **Primary executable:** `polymorfa`

## Objective

Build a public npm CLI with a deliberately handwritten developer experience for
working with Polymorfa from an interactive terminal, scripts, CI, and
standards-compliant MCP clients. The repository remains private while the npm
package is public.

The product should feel coherent in the way GitHub CLI, Stripe CLI, Vercel CLI,
and Cloudflare Wrangler feel coherent: a small number of durable concepts,
consistent flags and output, excellent recovery paths, and escape hatches that
do not force every API operation into a bespoke command.

The CLI is not an OpenAPI-generated command tree. OpenAPI remains useful for
coverage checks and the raw API escape hatch, but public command names, flags,
prompts, output, errors, and workflows are written and reviewed by hand.

## Product principles

1. **Design workflows, not endpoint aliases.** Frequent user goals receive
   curated commands even when they require multiple SDK calls.
2. **Keep complete access available.** `polymorfa api` exposes authenticated raw
   requests for operations that do not yet have a curated command.
3. **One behavior across humans and agents.** CLI commands and MCP tools call
   the same application services and share validation, authorization, and error
   handling.
4. **Make context visible.** Organization, project, environment, API surface,
   and profile are shown before consequential actions and in verbose output.
5. **Never leak credentials.** Secrets do not appear in arguments, config
   files, debug logs, shell history, MCP results, or generated support bundles.
6. **Automation is deterministic.** Non-interactive execution never waits for a
   prompt and every machine-readable format has a versioned schema.
7. **Drift may be deliberate but never invisible.** A coverage ledger records
   which API operations have curated commands, raw-only support, or an explicit
   deferral.
8. **Research each command at implementation time.** The command contract below
   fixes names and responsibilities. Exact flags and edge cases are verified
   against current APIs and relevant open-source CLIs before each command is
   implemented.

## Repository and release model

- The private source repository is `polymorfa/cli`.
- `dev` is the default development branch and follows the Polymorfa monorepo
  `dev` contract through an exact TypeScript SDK development revision.
- `main` is stable and follows the monorepo and SDK `main` contracts.
- Development changes land on `dev` and are promoted to `main` for releases.
- The public npm package is `@polymorfa/cli` with the `polymorfa` binary.
- The initial release line is `0.x`; breaking command changes require explicit
  changelog entries and migration notes.
- Publishing uses npm trusted publishing. Because the source repository is
  private, release documentation must not claim public source provenance.
- Customer-facing CLI documentation is released with the corresponding
  Polymorfa product documentation rather than living only in this private
  repository.

## Dependency architecture

```text
private shared contracts and types
                |
                v
        public @polymorfa/sdk
                |
                v
        public @polymorfa/cli
          |             |
          v             v
      terminal CLI   local MCP server
                          |
                          v
                    portable skills
```

`@polymorfa/sdk` is the only network client used by the CLI. It owns:

- Messaging and Platform authentication;
- request construction and serialization;
- typed resources and errors;
- request IDs and response metadata;
- timeouts, cancellation, retries, and idempotency behavior;
- pagination primitives;
- webhook signature verification and typed event parsing;
- API-version selection and per-request options; and
- a raw-request escape hatch.

The SDK may consume private shared contracts internally, but it must publish or
re-export every public type required by the CLI. The public CLI must not have an
unresolvable npm-private runtime dependency.

The CLI owns terminal interaction, configuration, profile selection, project
linking, command orchestration, formatting, progress, confirmation, diagnostics,
event forwarding, MCP presentation, and skill installation. MCP tools call the
same TypeScript application services used by commands; they never execute the
`polymorfa` binary or parse terminal output.

### Current SDK baseline

The development SDK gate is satisfied by `@polymorfa/sdk@0.1.0-dev.0` at exact
commit `08452992a32a392de5fc3d0fa3954ba6addd7f32`. It is ESM-only, requires Node.js
20 or newer, and has no runtime dependencies. Until the SDK is published to npm,
development installs pin the exact Git revision:

```shell
npm install github:polymorfa/sdks#08452992a32a392de5fc3d0fa3954ba6addd7f32
```

The CLI must not publish an npm release against a moving Git branch or an
unpublished SDK. Before the first public CLI release, replace the Git revision
with a compatible npm semver dependency on `@polymorfa/sdk` and verify the
packed CLI installs without private or Git-only runtime dependencies.

The SDK's committed coverage ledger records Polymorfa monorepo source commit
`1600403db9dcf7996dbbb882375b1165859829d3`. Hosted CI passed for the pinned SDK
revision in [GitHub Actions run 34971283972](https://github.com/polymorfa/sdks/actions/runs/34971283972).

The ledger contains 403 Messaging and Management operations: 262 covered by
typed methods, 106 deliberately excluded (including every console-only
operation route), and 35 missing. The missing entries are account-health and
safe-mode routes that the CLI does not expose. Graph-compatible APIs remain
outside this baseline, and the CLI does not claim support for excluded
dashboard, staff, or browser-only routes.

The curated resources cover Messaging sessions, QuickLinks,
messages, contacts, chats, channels, groups, labels, presence, calls,
LID resolution, user security codes, business profiles, catalogs, products,
collections, orders, compliance, observation policies, webhooks, client tokens,
project templates, project-scoped campaigns, and all 33 signed event payload
schemas plus Platform
organizations, projects, sessions, billing, campaigns, audiences, opt-outs,
media, organization API keys, members, audit logs, session bans, security
incidents, project-token metadata, saved QuickLink (widget) settings, and batch
session stop/delete. Curated commands do not use the SDK's raw escape
hatch to paper over a missing public contract. The explicit `api` command is
the user-directed low-level escape hatch and keeps the SDK's authentication,
transport, retry, pagination, and error behavior.

The CLI depends on the root server package and on its `@polymorfa/sdk/calls`
subpath, the programmatic Calls client, for the call event stream and call
audio. It uses only that public, neutral entry point, never the Calls internal
module. Browser, React, Next.js, UI, Elements, and Devtools SDK workspaces are
not CLI runtime dependencies. The Calls client ships inside `@polymorfa/sdk`,
so the pinned Git commit installs it with no separate package.

## Internal boundaries

The implementation will use TypeScript, ESM, Node.js, and `@oclif/core`. The
repository is divided by responsibility rather than by individual endpoint:

- `src/commands/`: thin oclif adapters that parse input and render results.
- `src/services/`: handwritten workflows shared by the CLI and MCP server.
- `src/sdk/`: client construction, credential selection, API-surface routing,
  and SDK error normalization.
- `src/config/`: global profiles, project links, environment resolution, and
  secure credential references.
- `src/output/`: tables, JSON schemas, templates, redaction, progress, and
  terminal capability detection.
- `src/listen/`: event-stream client, local forwarding, cursors, retries, and
  shutdown handling.
- `src/mcp/`: tool, resource, prompt, transport, and annotation definitions.
- `skills/`: portable workflow skills that depend on documented CLI or MCP
  contracts rather than internal code.
- `docs/command-research/`: one implementation research record per command
  family.

Command adapters must not contain business logic. Application services accept
typed inputs and return typed results independently of terminal or MCP output.

## Global CLI contract

### Command grammar

Commands use singular resource nouns and explicit verbs:

```text
polymorfa session list
polymorfa session view <session>
polymorfa message send text --to <recipient> --body <text>
```

IDs, canonical names, and linked context are accepted wherever resolution is
unambiguous. Ambiguous names fail with a selectable list rather than silently
choosing the first result.

### Global context flags

- `--profile <name>` selects stored authentication and defaults.
- Organization-owned API requests use the organization bound to the selected
  key. The CLI does not accept an organization override that could relabel a
  request without changing its authorization.
- `--project <id-or-slug>` overrides the linked or profile project.
- `--api-version <version>` overrides the SDK default when the API permits it.
- `--no-interactive` forbids prompts and interactive selection.
- `--yes` accepts command-level confirmations in automation.
- `--verbose` explains context and workflow decisions.
- `--debug` emits sanitized transport diagnostics.
- `--no-color` disables ANSI styling.
- `--help` and `--version` behave consistently at every command level.

Resolution precedence is command flag, environment variable, linked project,
profile default, then interactive selection. A missing value in non-interactive
execution is a usage error with the exact flag or environment variable needed.

### Output

Interactive output uses concise tables, summaries, progress indicators, and
next-step commands. Automation uses explicit modes:

- `--json` returns the complete stable JSON representation.
- `--json <fields>` selects fields when the command supports field selection.
- `--jq <expression>` filters JSON output.
- `--template <template>` renders a documented template contract.
- `--quiet` prints only the primary identifier or value.

Colors and progress may change based on TTY detection; data shape may not.
Secrets are redacted in every mode. Streaming commands use JSON Lines when
`--json` is selected.

List commands use `--limit`, `--cursor`, and `--paginate`. A single page is the
default for interactive use. `--paginate` follows all pages and preserves
stable ordering. Commands warn before producing unusually large terminal
output, but non-interactive output does not prompt.

### Mutations and errors

Normal explicit mutations such as `message send` execute without a redundant
confirmation. Destructive, bulk, irreversible, or unusually broad actions show
their resolved scope and require confirmation in an interactive terminal or
`--yes` in automation. `--dry-run` is implemented for workflows where the
server can validate the same payload without applying it; it is not simulated
client-side when that would provide false confidence.

Errors contain:

- a concise human message;
- a stable CLI error code;
- the Polymorfa request ID when available;
- the selected profile, organization, project, and API surface when relevant;
- a corrective command or documentation link; and
- additional sanitized detail under `--verbose` or `--debug`.

Stable process exit categories cover usage, authentication, authorization, not
found, conflict, rate limiting, network failure, server failure, partial
success, and interrupted execution.

## Authentication, profiles, and project links

`polymorfa auth login` prefers a browser/device authorization flow for human
users. That flow is a backend prerequisite and must issue a CLI-appropriate,
revocable credential rather than reuse browser cookies or dashboard headers.
Headless login accepts a key through standard input; credentials are never
accepted as positional arguments or ordinary flag values.

Credentials are stored in macOS Keychain, Windows Credential Manager, or the
Linux Secret Service. The config file stores only profile metadata and secure
credential references. CI normally supplies credentials through environment
variables and receives an explicit warning if an interactive profile is being
used unexpectedly.

`polymorfa link` creates `polymorfa.json` with non-secret organization,
project, and environment identifiers and adds the local file to `.gitignore` by
default. `polymorfa unlink` removes only the local link. Commands always show a
clear distinction between changing local context and changing a remote
resource.

## Command tree

### Foundation and escape hatches

```text
auth
  login
  logout
  status
  list
  use

config
  list
  get
  set
  unset
  path
  edit

context
  current
  list
  use

link
unlink
whoami
dashboard

api <path>
listen
doctor
completion
update
version
```

`api` follows the useful parts of `gh api`: method selection, typed and raw
fields, headers, body input, inclusion of response headers, pagination,
slurping, and JSON filtering. It adds an explicit `--surface
messaging|platform` selector. The CLI may infer the surface only when the route
and available credential make the choice unique.

`dashboard` opens the active organization, project, session, or other supplied
resource in the Polymorfa console without embedding credentials in the URL.

### Organizations, projects, credentials, access, and billing

```text
organization
  list
  view
  create
  update

member
  list
  invite
  update
  remove

project
  list
  view
  create
  update
  archive
  restore
  delete

key
  list
  create
  revoke
  rotate

client-token
  mint
  rules
    view
    set
    delete

usage
  summary
  export

billing
  status
  transactions
  pricing
  reminders
    set
  portal
```

Key and client-token creation print secret material once and never include it
in logs. Client-token minting requires an explicit session and ephemeral client
identifier, validates the requested TTL, and does not persist the minted token
in a CLI profile. Rules can be supplied as a file or structured flags, are
rendered before mutation, and use the SDK's typed client-token request and
response contracts.

Client-token minting is not exposed as an MCP tool in the initial release
because returning a bearer token through an agent transcript creates an
avoidable disclosure path. Rotation is an orchestrated workflow with an overlap
period when the API supports one; otherwise it explains the safe manual sequence
rather than pretending rotation is atomic. Billing commands expose operational
status and open the hosted billing portal; they do not duplicate the console's
purchasing UI.

The organization-key billing contract provides balance status, usage, an
unpaged transaction list, tier pricing, and reminder-settings mutation. The CLI
does not invent pagination or a usage export when the API exposes neither.
Billing top-ups and console usage-insight aggregation remain dashboard/staff
surfaces. `billing portal` is a credential-free console navigation helper, not
an API mutation.

`organization view` remains credential-compatible. Organization update and
member/invite mutations remain reserved and unshipped because those routes
require a dashboard session. In particular, the CLI must not use
`raw.request` to bypass that credential boundary.

### Sessions and messaging

```text
session
  list
  view
  create
  reconnect
  disconnect
  stop
  delete
  status
  logs

quicklink
  create
  view
  cancel

message
  list
  view
  send
    text
    media
    template
    location
    contact
    poll
    interactive
  react
  mark-seen
  typing
  star
  edit
  delete

media
  download
  view
  persist

label
  list
  create
  update
  delete
  chat
    list
    replace

quick-reply
  list
  create
  replace
  delete

profile
  view
  name
    set
  status
    set
  picture
    set
    delete

privacy
  view
  set
  disappearing-timer
    set

presence
  view
  set
  chat
    view
    subscribe

channel
  list
  view
  create
  delete
  message
    list
    updates
    mark-viewed
    react
  live-updates
    subscribe
  follow
  unfollow
  mute
  unmute

contact
  list
  check
  view
  picture
  info
  devices
  business-profile
  blocklist
  block
  unblock

business
  profile
    view
    update
    cover
      set
      delete
  catalog
    view
    create
    cart
      set
  product
    view
    create
    replace
    delete
    visibility
      set
    appeal
  collection
    list
    view
    create
    update
    delete
    reorder
    appeal
  order
    view
  compliance
    view
    replace
  accounts
    view
  eligibility
    view

call
  reject

calls
  place
  accept
  reject
  leave
  end
  invite
  watch
  media
  settings
    get
    set

lid
  resolve

user
  security-code

chat
  list
  view
  messages

group
  list
  view
  create
  update
  participants
    list
    add
    remove
    promote
    demote
  invite-link
  join
  leave
```

Number pairing uses a persistent hosted QuickLink. `quicklink create` accepts a
JSON request with an organization API key and returns the link URL,
`quicklink view` reads its status, and `quicklink cancel` invalidates a link that
has not connected. View and cancel also accept an exact-project token. Saved
QuickLink settings are managed with `widget view` and `widget update`; the CLI
ships no separate `quicklink settings` commands. The CLI does not retrieve or render
direct QR payloads or pairing codes from session routes. `session status` uses
`sessions.retrieve`. Operation inspection is console-only at the pinned API
contract, so the CLI does not poll operation IDs. The source contract has no separate
connection-status or session-log route. `session logs` therefore remains
reserved and unshipped; `/api/info/status` is unauthenticated API runtime health
and is not presented as session state.

Message content uses typed subcommands instead of a single flag-heavy command.
Each type validates mutually exclusive content locally, then relies on the SDK
and API for canonical validation. File uploads use streamed I/O, MIME detection,
size preflight, progress in TTYs, and resumability only where the server
supports it.

The source Messages tag is a five-operation mutation family: send, seen,
typing, react, and star. The initial CLI slice exposes all five through
`message send text`, `message mark-seen`, `message typing`, `message react`, and
`message star`. Every command requires explicit session and chat scope and
accepts an idempotency key. Reply context and forwarding are request fields on
the single send route, so `--reply-to`/`--reply-participant` and `--forwarded`
remain send options rather than synthetic commands. Server API keys require
`messages:write`; client tokens reach the same SDK methods only under their
live allowed-action, recipient, rate, and daily-limit rules. Message history,
list, and search remain unshipped because the pinned source exposes no such
operations.

Messaging media lookup is distinct from Platform media. `media view` returns
typed metadata, `media download` writes a buffered SDK response to an explicit
local path, and `media persist` asks the server to save media into configured
object storage. All three require a server API key; client tokens have no Media
action. Downloads preflight `fileLength`, enforce a 100 MiB default memory
limit, reject existing destinations unless `--force` is explicit, and return a
small receipt instead of serializing binary data into JSON. The SDK buffers the
entire response and the source exposes no upload, delete, list, resumable,
range, or streaming contract, so the CLI does not claim any of those
capabilities. Media send URL/base64 inputs remain part of `message send media`,
not an upload API.

Labels are an unpaged, server-key-only session resource. `label list`, create,
update, and confirmed delete map directly onto typed SDK methods. Chat
assignment uses `label chat list` and the deliberately explicit `label chat
replace`: the source PUT replaces the complete set, `--clear` sends an empty
set, and there are no incremental attach/detach or message-label routes. Label
reads return the legacy array by default and preserve the typed observation
envelope only when `--include-observation` is requested. Observation-policy
updates remain a separate future command family because they affect presence,
typing, label retention, and event behavior rather than label CRUD alone.

Quick Replies are an unpaged, server-key-only Linked Device resource.
`quick-reply list` preserves the source observation envelope. Create and the
deliberately named `quick-reply replace` accept shortcut, message, repeatable
keywords, and optional count; replacement requires the complete shortcut and
message rather than pretending the source `PUT` is a patch. Confirmed delete is
the fourth and final operation. The source exposes no retrieve-by-ID, send,
sync, history, or search route. Quick Replies are stored canned responses, not
interactive message buttons, and `quickReplyMode` remains part of the separate
observation-policy contract.

Profile is a server-key-only Linked Device resource. `profile view` preserves
the source response in JSON and renders both the published profile shape and
the connected-account fields returned by the pinned live handler. Name and
status use explicit nested setters. Picture set accepts exactly one remote URL
or bounded local file; local bytes are encoded into the source's JSON base64
field rather than advertised as a multipart or streaming upload. Confirmed
picture delete completes the five-operation family. The source exposes no
profile history, picture download, binary upload, streaming, pagination, or
client-token action.

Privacy is a server-key-only account-level resource. `privacy view` returns the
complete typed setting set. `privacy set` validates setting/value pairs directly
against the public SDK's runtime matrix rather than copying an aggregate enum or
sending unvalidated strings. The separate `privacy disappearing-timer set`
command maps `off`, `24h`, `7d`, and `90d` to the exact supported seconds and
changes the account default only. Per-chat timers remain owned by Chats. The
source exposes no privacy history, value-list endpoint, pagination, or
allowlist/blacklist member-management route.

Presence separates remembered self state from policy-governed chat
observations. `presence view` reports desired and last successfully sent state
and visibly preserves `authoritative: false`; it is not a live remote-account
query. `presence set` accepts only the SDK's available/unavailable values and
requires a server key. Chat view and subscribe accept server keys or
appropriately scoped, session-bound client tokens. Subscription is an explicit
one-shot or renewal operation whose returned expiry drives the caller; no
watch, history, polling helper, unsubscribe, or policy-bypass command is
invented. Retained composing/paused observations are rendered separately from
the outbound `message typing` action.

Channels are server-key-only resources for active Linked Device sessions and
remain distinct from chats and groups. The complete 13-operation family covers
list/view/create/confirmed delete, bounded message and update reads, viewed and
reaction actions, temporary live-update subscription, and follow/unfollow and
mute/unmute state. Message reads map `--limit` to the source count of 1 through
100 and accept the source's numeric boundaries, but the bare-array responses do
not support automatic pagination. Live-update subscription reports its duration
without claiming a stream, listener, socket, polling helper, or unsubscribe.
Creation omits picture input while the pinned public field is ignored by the
runner. Reactions enforce the live runner's 32 UTF-8 byte boundary and preserve
an empty value for removal.

Contacts are server-key-only resources for active Linked Device sessions.
`contact list` and `contact view` expose stored session contact data, while the
explicit `contact info` command exposes live WhatsApp user metadata. Check
accepts repeatable phone numbers in one registration query. Picture returns a
URL without downloading bytes; devices remain upstream JID strings; business
profile preserves all typed fields. Blocklist keeps its source hash, and
reversible block/unblock actions accept idempotency without redundant deletion
confirmation. The source exposes no search, pagination, contact CRUD, picture
download, device management, or business-profile mutation route.

Business App commands are server-key-only, connected Linked Device resources;
project credentials, browser client tokens, and Cloud API sessions are rejected.
The CLI mirrors the profile, catalog, product, collection, order, compliance,
linked-account, and eligibility boundaries instead of flattening 25 operations.
Rich replacement bodies use bounded JSON `--input` while common scalar and
repeatable values use named flags. Product replacement requires explicit
`hidden` to prevent the runner's omission-to-false behavior from silently
unhiding an item. Delete actions require confirmation. All non-GET operations,
including order lookup, preserve idempotency and asynchronous request envelopes.
Catalog and collection cursors remain explicit; collection view cannot claim a
next cursor the source does not return. Media stays URL/base64/trusted-media
JSON, not a fabricated upload or streaming abstraction.

Calls, LIDs, and user security codes are three distinct server-key-only Linked
Device resources. Call rejection requires the incoming caller and call ID,
accepts idempotency, and preserves either synchronous or asynchronous response
shapes without implying broader call support. LID resolution accepts exactly one
phone number, stable ID, deprecated LID alias, or username and optional four-
digit key. Security-code lookup requires a stable `digits@lid` user ID; human
output favors the 60-digit code and does not dump display-QR base64, while JSON
retains the complete no-store response. No command claims bulk identity lookup,
call history, or security-code verification submission through that session
route. The unified Calls API is a separate `calls` family: place, accept (with
an optional exclusive claim) or join, decline, leave one connection, end,
invite, watch session call updates as JSON Lines, carry call audio as raw PCM,
and read or replace session call settings. It never exposes offers,
candidates, or media framing. Client tokens act as their own participant and
cannot name `--participant` or use call settings; server API keys name the
session and may name a participant. See `docs/command-research/calls.md`.

Commands for contacts, chat history, and logs state whether data comes from
opt-in hosted storage, live session state, or another documented source. Empty
hosted-storage results must not be presented as proof that no message or contact
exists.

Groups require an explicit Messaging session until linked session context is
implemented. The source exposes complete, unpaged group and participant arrays,
so the CLI does not synthesize cursors. The source `DELETE` operation is a leave
alias rather than remote group deletion; the CLI exposes `group leave` and does
not claim a destructive `group delete` workflow. Groups accept server API keys
and reject Messaging browser client tokens; the CLI enforces that boundary
before transport.

The pinned source contract exposes chat message edit/delete, archive/unarchive,
and disappearing-timer mutations, but no chat list or history-read route.
Accordingly, `chat list`, `chat view`, and `chat messages` remain reserved and
unshipped until a real credential-compatible source operation exists. The CLI
does not synthesize them from unrelated label or hosted-storage routes.

### Templates, campaigns, audiences, webhooks, and events

```text
template
  list
  view
  create
  update
  delete
  preview
  submit

campaign
  list
  view
  create
  analytics
  launch
  pause
  resume
  stop
  requeue

audience
  list
  view
  create
  import
  delete

opt-out
  list
  add
  add-batch
  remove

webhook
  list
  view
  create
  update
  delete
  test
  rotate-secret

event
  list
  view
  replay

logs
  tail
  query
```

Template, campaign, and audience commands support file-based declarative input
and `--dry-run` only when backed by server validation. Interactive creation may
guide the user, but every workflow must also have a complete non-interactive
form suitable for source control and CI. Template preview uses the typed
Messaging project-template builder contract; submit remains an explicit
external-effect action with a confirmation and idempotency strategy. Audience
import and opt-out batch operations use explicit input schemas, preview counts,
bounded concurrency, and machine-readable partial-failure artifacts.

The `flow` top-level command name remains reserved but is not shipped against
this SDK baseline. The separate Platform template and Flow routes require
dashboard JWTs and reject organization keys. The CLI must not collect, persist,
or replay dashboard session JWTs to bypass that boundary, and neither MCP tools
nor skills may expose those routes. Platform template management and Flow
commands can enter the implementation plan only after the Platform API provides
a CLI-appropriate organization or project credential contract and the public
SDK exposes it. The shipped `template` family uses the credential-compatible
Messaging project-template resource instead. `message send template` is a
separate Messaging send operation.

Campaign creation accepts one bounded JSON object. Launch accepts epoch
milliseconds or a timezone-qualified ISO instant, then returns a durable
operation ID. Launch, pause, resume, and terminal stop report accepted work and
do not imply that the transition completed. These Messaging campaign operation
IDs cannot be polled with machine credentials; check campaign state with
`campaign view`. Stop requires `--yes`. Requeue is a direct
transaction and reports its moved-recipient count. The source exposes no
campaign update, delete, validation, archive, duplicate, recipient, event,
history, replay, watch, or cancel route, so those commands remain reserved.

Webhook tests generate a synthetic event and a traceable delivery. Event replay
creates a new delivery for a retained event; delivery retry creates a new
immutable attempt on the same delivery. Neither operation rewrites history.
General event history, webhook ownership, delivery and attempt inspection,
secret rotation, test delivery, replay, and retry are now typed developer
resources. Their receipts report an operation ID, but operation inspection is
console-only at the pinned API contract, so the CLI exposes no operation
commands. The CLI uses only those typed SDK resources and
never reaches dashboard or staff routes through raw requests.

Commands remain hidden or clearly unavailable until their underlying API
contract exists. The CLI must never advertise a command that only fails with a
generic not-implemented response.

## `listen` design

`polymorfa listen` is inspired by Stripe CLI but is a Polymorfa event workflow,
not a permanent webhook configuration shortcut.

```text
polymorfa listen
  --events <event[,event...]>
  --forward-to <local-url>
  --header <name:value>
  --project <id-or-slug>
  --from <cursor-or-time>
  --json
```

The command requires an authenticated, resumable event stream that does not
exist merely because durable outbound webhooks exist. The upstream platform
must provide short-lived listener sessions, scoped event filters, an expiring
stream credential, cursor-based reconnection, and a clear retention limit.

The current API audit confirms that neither general event history nor a
server-credential listener-session endpoint exists. Typed webhook payloads make
future streaming safe to consume, but do not by themselves make `listen`
implementable.

The CLI prints events or forwards the exact request body to a local HTTP
endpoint with documented Polymorfa signature headers. It maintains a bounded
local retry queue, preserves ordering within the guarantees of the upstream
stream, reports dropped or expired events visibly, and shuts down cleanly on
interrupt. Local forwarding never disables TLS verification for remote
destinations and never prints signing secrets unless the user explicitly asks
for the one-time value in an interactive terminal.

Implementation of `listen` begins with a focused comparison of Stripe's open
source listener, Cloudflare/Vercel log streams, the current Polymorfa webhook
delivery model, and the final upstream listener API. The command does not ship
until one real event has been streamed, forwarded to localhost, retried, and
resumed after disconnection.

## MCP design

The local MCP server is a first-class mode of the npm package:

```text
polymorfa mcp serve
polymorfa mcp install <client>
polymorfa mcp uninstall <client>
polymorfa mcp status [client]
polymorfa mcp tools
polymorfa mcp doctor
```

`mcp serve` uses standard input/output by default. An optional local HTTP
transport may be added for clients that require it, but no platform-specific
plugin is required. A future hosted remote MCP endpoint may reuse the same
registry and schemas; it is not a prerequisite for the local server.

Tools are curated and typed rather than mechanically generated from OpenAPI.
They are registered from the same application services as commands and grouped
into selectable toolsets such as `core`, `messaging`, `webhooks`, and
`campaigns`. The default toolset stays small enough for reliable tool
selection; clients can request broader sets explicitly.

The server also exposes non-secret resources for active context, capabilities,
session summaries, and webhook/event metadata where useful. Reusable MCP
prompts cover diagnostic or multi-step workflows only when a prompt adds value
beyond a skill.

Every tool includes accurate read-only, destructive, idempotent, and external-
effect annotations. Mutating tools return a proposed action or require host
approval where the MCP client supports approval. The server never weakens
authorization because the caller is an agent. Credentials are resolved through
the selected CLI profile or environment and never returned through MCP.

`mcp install` is a convenience command that writes or prints standards-based
client configuration for known clients after showing the exact target file and
server command. It does not submit a Claude plugin, require a plugin directory,
or make platform-specific packaging a capability boundary.

## Skills

Portable skills live beside the CLI and depend only on public CLI and MCP
contracts:

```text
polymorfa
polymorfa-messaging
polymorfa-webhooks
polymorfa-campaigns
```

The core skill teaches authentication, context, output, safe mutation, and when
to prefer MCP versus the CLI. Domain skills cover high-quality workflows,
required evidence, expected side effects, and failure recovery. They do not
embed credentials, unpublished implementation details, or brittle absolute
paths.

```text
polymorfa skill install [name] [--agent <agent>] [--global|--project]
polymorfa skill list
polymorfa skill update [name]
polymorfa skill remove <name>
polymorfa skill doctor
```

The installer supports documented skill-directory conventions and a generic
output mode. Claude plugin packaging and approval are explicitly outside the
initial scope.

## Per-command research contract

Before implementing each command family, create or update
`docs/command-research/<family>.md` with:

1. the exact current SDK methods and API operations used;
2. current authentication, scopes, pagination, rate limits, and idempotency;
3. comparable behavior in relevant open-source CLIs;
4. proposed flags, interactive flow, machine output, and examples;
5. destructive or high-volume behavior and approval rules;
6. error cases and recovery commands;
7. telemetry and redaction considerations;
8. test fixtures and live verification required; and
9. the coverage-ledger changes produced by the command.

Research can refine options and subcommands, but it may not silently violate
the global CLI contract or rename an approved top-level command. A material
change to command ownership or safety returns to design review.

The repository maintains a machine-readable ledger mapping every Messaging and
Platform operation to one of:

- curated CLI command and MCP tool;
- curated CLI command only;
- curated MCP tool only with a documented reason;
- raw `api` access only; or
- intentionally deferred with an issue and target milestone.

Coverage gaps do not force low-quality generated commands. They create visible
maintenance work.

## Delivery phases

### Phase 0: foundation

- Pin and exercise the verified `@polymorfa/sdk@0.1.0-dev.0` development
  baseline described above.
- Repository, branching, release, testing, and command-research scaffolding.
- CLI runtime, global flags, config, secure credentials, output, errors, and
  redaction.
- `auth`, `context`, `link`, `api`, `doctor`, completion, and version commands.

### Phase 1: core messaging and MCP

- Organization and project discovery.
- Session lifecycle and connection workflows.
- Text and media message sending plus essential reads.
- Webhook inspection and testing.
- Local MCP server, core/messaging toolsets, resources, annotations, and client
  configuration helpers.
- Initial core and messaging skills.

### Phase 2: event development workflow

- Upstream listener-session API.
- `listen`, event inspection/replay, local forwarding, reconnection, and test
  fixtures.
- Webhook and event skills.

### Phase 3: complete curated surface

- Contacts, chats, groups, templates, audiences, opt-outs, media, access
  management, usage, billing, logs, and remaining curated operations.
- Reassess the reserved Platform Flow command family only if a compatible
  non-dashboard credential contract has shipped.
- Coverage-ledger reconciliation and command-specific research.

### Phase 4: release hardening

- Install and upgrade testing across supported Node.js versions and macOS,
  Linux, and Windows.
- Public documentation, examples, migration policy, support bundles, and npm
  trusted publishing.
- Stable-channel promotion from `dev` to `main`.

## Development implementation status

The current implementation branch contains working, unpublished vertical
slices:

- the installable `polymorfa` ESM executable on Node.js 22 or newer;
- `polymorfa version` with human, JSON, and quiet output;
- `polymorfa api <endpoint>` for Messaging or Platform credentials;
- GET query fields, JSON request fields, custom headers, file or bounded stdin
  bodies, response metadata, timeouts, and API-version overrides;
- SDK-derived error categories, request IDs, exit codes, and credential
  redaction;
- stdin-only API-key login with named profiles and fail-closed native keyring
  storage;
- profile listing, activation, local credential status, and scoped logout;
- read-oriented group list, view, participant list, and invite-link commands
  with explicit session scope;
- typed text send, reaction, seen, typing, and star message actions;
- Messaging media metadata, bounded local download, and server persistence
  commands;
- complete label CRUD and explicit full-set chat assignment commands;
- complete observed Quick Replies list, create, replace, and confirmed delete
  commands;
- complete connected-account Profile view, name/status setters, bounded
  picture setting, and confirmed picture deletion commands;
- complete account-level Privacy view, matrix-validated setting update, and
  default disappearing-timer commands;
- complete remembered self-presence view/set and policy-governed chat
  observation view/subscription commands;
- complete Channel discovery, lifecycle, bounded message/update reads, message
  actions, temporary subscription, and follow/mute state commands;
- complete Contact list/check/view, live metadata, picture URL, device,
  business-profile, blocklist, and block/unblock commands;
- complete 25-operation Linked Device Business App profile, catalog, product,
  collection, order, compliance, linked-account, and eligibility commands;
- complete incoming-call rejection, singular LID resolution, and no-store user
  security-code inspection commands;
- unified Calls commands for placement, answering and joining with exclusive
  claims, declining, leaving, ending, inviting, session call updates, raw PCM
  call audio, and session call settings, pinned to an unpushed SDK revision;
- organization-key API-key list/revocation, member and audit lists, session-ban
  filtering, security-incident list/acknowledgement, and project-token metadata
  commands;
- bounded batch session stop and confirmed management deletion commands;
- complete Messaging campaign list/create/view/analytics and lifecycle
  commands, with accepted-work receipts and direct requeue;
- explicit owner-scoped event list/view/replay, webhook CRUD/test/secret
  rotation, delivery and attempt inspection, and retry commands;
- persistent QuickLink create with organization keys, view/cancel with
  organization keys or exact-project tokens, and no direct session QR fallback;
- the bounded SSE listener with JSONL and human sinks, fail-closed gap handling,
  cumulative acknowledgement, checkpointed reconnects, exact-byte local
  signing, and redirect-safe forwarding;
- the stdio MCP server with in-process listener start/status/stop controls and
  install, status, doctor, and uninstall helpers;
- packaged CLI, webhook, and operations skills; and
- real local HTTP integration tests that exercise the SDK and listener
  transports.

This status does not claim an npm release, browser/device authorization, a real
operating-system keyring smoke test, remote identity validation from `auth
status`, project linking, unimplemented commands in the broader command map, or
deployed Staging acceptance. Those remain later delivery gates.

## Verification

Each application service has unit tests independent of oclif and MCP. Commands
have parser and golden-output tests. MCP tools have schema, annotation, result,
and approval tests against the same service fixtures.

Release gates include:

- TypeScript typecheck, lint, unit tests, and production build;
- `npm pack` inspection and clean-install smoke tests;
- PTY tests for prompts, progress, interrupts, QR output, and non-interactive
  behavior;
- golden tests for help, tables, JSON, JSON Lines, templates, and errors;
- authentication-store tests on supported operating systems;
- redaction tests containing seeded secret-like values in every output path;
- SDK compatibility and API coverage-ledger checks;
- MCP protocol conformance and client smoke tests;
- real development-environment checks for authentication, linking, session
  connection, message sending, webhook testing, and event listening; and
- public documentation validation in the Polymorfa documentation repository.

Compilation and mocked tests are not sufficient evidence for browser login,
keychain storage, live pairing, message delivery, webhook forwarding, event
resume, or MCP client configuration.

## Explicit non-goals

- Generating the public command tree from OpenAPI.
- Reimplementing SDK transport behavior inside the CLI.
- Depending on Claude plugins or marketplace approval.
- Shipping a general plugin framework in the first release.
- Treating raw API access as a substitute for core curated workflows.
- Storing credentials in project files or printing them in debug output.
- Advertising commands whose supporting API contract does not yet exist.
- Duplicating the full Polymorfa console, billing checkout, or visual builders
  inside a terminal.

## Acceptance criteria

The first public release is acceptable when a new user can install
`@polymorfa/cli`, authenticate without placing a secret in shell history, link
a project, inspect and connect a session, send a real message, inspect and test
a webhook, call an unsupported endpoint through `api`, configure a standard MCP
client, and receive actionable errors without reading repository internals.

An agent using the local MCP server must be able to discover the active context,
perform the same core read workflows, propose or execute an approved message or
webhook action, and receive typed, redacted results with correct side-effect
annotations.
