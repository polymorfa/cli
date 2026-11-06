# Account-device consumer source checkpoint

LOCAL SOURCE / UNPUBLISHED. Existing owning PR: https://github.com/polymorfa/cli/pull/86.

The candidate normally integrates actual CLI main
`b7ad48a3393f83b14058069f6948bfd9fb492c00` into the existing owning head
`233ec3b20425e6a69cd9b6caab49a29d39773926`. It adds seven separate `account`
commands: login, list, use, status, logout, teams and projects. Machine auth
commands, profile schema and credential types remain separate. Unknown or
account-session kinds fail before any machine SDK factory can coerce their
value. There is no account raw path, key mint, pairing, messaging or grant edit.

## Producer and credential boundary

The consumer binds the actual API880 LOCAL producer
`89e59833a9d7478a862e7b0b00c411e3ae22e689`. Its later identity-only successor
`389990d89728a633a14bd30ec678d5b5604e137a` retains the same API, CLI, grant,
Console, SQL, lock and runtime bodies. API880 owns CLI registration, session
classification, live grants, RLS, resource selection, approval notices and
server revocation. These local inputs do not establish hosted availability.

Login pins the configured HTTPS API and Console origins and accepts only the
exact configured Console `/device` approval URL. The client ID is
`polymorfa-cli`; flags cannot replace it, the JWT audience or an endpoint.
The opaque session is keyring-only in a separate namespace. JWTs are memory-only
and verified with the pinned issuer's credentialless JWKS, Ed25519 signature,
audience, session/user binding, expiry and live session identity. Refresh does
not rotate the opaque session or extend its server lifetime.

The only resource requests are paginated GET teams and GET projects with a
required team UUID. Current/future resource approval is not command authority.
Stored profile issuers cannot be overridden on later commands. The browser
artifact rejects all seven commands before environment, keyring or fetch access.

Metadata publication has a separate revision guard. Late, stale or concurrent
results cannot overwrite another profile update. An uncertain save is read back;
an unavailable readback preserves the sole credential. Logout distinguishes
remote revocation from local metadata and keyring cleanup. Revocation of another
bound session is refused. No OS keyring, real account, provider or real Number
was exercised by these checks.

## Actual dependency and checks

A fresh frozen `npm ci --ignore-scripts --no-audit --no-fund` installed the exact
unchanged source manifest and lock, including the declared public SDK
`0.1.0-dev.20261004024706`. No source dependency pin, lock row or SDK body changed.
The earlier private SDK graph and all its receipts remain separate historical
inputs; the results below use the real public dependency. The earlier suspected
public-package blocker is closed for this candidate.

All commands used Node 24.22.2. On the combined source and public graph:

- All five discovered account-device files passed: 73 tests, zero failed,
  skipped or todo. They cover ephemeral Ed25519 verification, intercepted exact
  API payloads, owned filesystem/CAS behavior, cancellation, refresh races,
  uncertain publication, machine-factory refusal and mounted commands.
- Full source and test typechecking, configured ESLint, project formatting and
  the clean native build passed.
- The genuine compiled-command reference and its Node regression passed;
  the unchanged-output check reported 388 public commands.
- The real browser producers and stock emitted-module verifier passed with
  389 command IDs and 461 emitted files. All seven account commands refused
  before environment/fetch. Native keyring and account-session code were absent
  from the browser graph. The existing message-send, global-fetch restoration
  and agent-setup exclusion assertions remained intact.
- The actual package dry-run passed and the production dependency audit
  reported zero vulnerabilities.

The machine-credential golden fixture remains byte-identical by its stored Git
entry and unchanged filesystem metadata. Its body was not read, hashed, copied,
formatted or executed. The original formatter exclusion remains unchanged.
The complete credential-fixture runtime suite is UNRUN; the five selected files
and their actual 73 assertions are recorded without claiming that larger suite.

## Integration and provenance

The real current-main integration had one text conflict in the call research
guide. It retains main's simultaneous-call risk and SDK-limit guidance together
with the authored team-key terminology. The conflicted index and stages were
saved before resolution. All nonowned target identities are preserved.
README insertion was limited to the account section; reference and browser
registry outputs came from the real producers on the combined source.

The exact type-only Campaign predecessor in `src/services/campaigns.ts` comes
from the original Campaign writer's checked LOCAL
`7a52263470b6c8563de17e436e128bf1ecc36e0b`. Its runtime call, query and renderer
are unchanged; author provenance and the inverse comparison remain in the
private source receipt. No Campaign authority or SDK release is inferred.

Original source, indexes, refs, earlier setup graphs and checked postimages are
preserved under the existing task directory. The actual final local commit,
tree, selected-path equality and postcommit artifact identity are recorded in
the companion receipt, rather than embedding a self-referential commit here.

## Six-part assessment and remaining gates

| Part            | Disposition                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API             | Consumer updated against actual LOCAL API880 source. No server, schema, role, grant, signed native wire or feature authority changed here. Hosted producer availability remains unqualified.                      |
| SDKs            | The unchanged declared public package passes the actual local consumer checks. Account transport stays separate from machine SDK clients. No new SDK package or publication is required by this consumer delta.   |
| CLI             | Separate account metadata/keyring, seven commands, strict transport and machine refusal implemented and checked on the current-main composition. The complete protected credential-fixture runtime remains UNRUN. |
| Docs            | README and genuine command reference are updated. Public-site release composition remains tied to the producer's actual release; no shipped changelog or availability claim was added.                            |
| Feature release | No flag, entitlement, enrollment, command grant, package/tag, deployment or production setting changed. Server registration and live grants remain authoritative.                                                 |
| Admin           | No new staff state or action: API880 retains session/grant authority and existing revocation controls. No Admin credential, capability or bypass was introduced.                                                  |

Current-head hosted CI, code/security reviews, CodeRabbit disposition and the
complete ready stack remain required before merge. No automated review was
requested. No push, workflow dispatch, rerun, stack edit, shared database, SSH,
provider or deployment action occurred. CI-triggering publication remains held
until this PR receives its serial queue turn.
