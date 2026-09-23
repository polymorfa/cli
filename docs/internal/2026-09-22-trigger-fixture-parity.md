# Trigger fixture parity

Resolved on 2026-09-23: SDK PR #290 merged as
`2b693964305b91dc34b9092ca5774055c7e47d88` and published
`@polymorfa/sdk@0.1.0-dev.20260923093259`. CLI PR #15 now pins that exact
registry artifact in its manifest and lockfile. A clean install and the full
CLI verification suite passed on the branch merged with current `dev`.
The notes below record the earlier local repair and its then-open dependency.

Local repair of CLI #15 at `67b1c0f43568c015c779ebf2c6475237f7b980a8`.
Not published or release-ready. The API contract checked is
`polymorfa/polymorfa@63111fec728ac3ebc9a825ea57ebc4c592abdafc`.

The API lists `session.restriction_updated`, but the CLI's pinned SDK
`0.1.0-dev.20260922102711` omits it from the fixture union. The CLI consequently
refuses an event that `trigger --list` prints. Its override parser also treats
`restrictionActive=false` as a string. This repair types the override as a
boolean and tests both starting and ending a restriction through the command
and HTTP request.

## SDK dependency

Companion SDK work is based on `polymorfa/sdks@8392f66b4df0b0fee3403e27e3d2914516b0e243`,
branch `fix/test-event-fixture-contract-20260922`. It adds the fixture,
`restrictionActive?: boolean`, and the API's `call_restricted` member of
`callEndReason`. It stores the four relevant OpenAPI schemas, source commit,
and source hash in `contracts/testing-events.json` and checks the fixture list
against that snapshot.

CLI validation uses a tarball built from that local SDK source. The package
manifest and lockfile intentionally still pin the published dependency. A
clean install of that old version cannot build this repair because its types
lack `restrictionActive`. Publish and inspect the companion SDK artifact, then
update the CLI's exact dependency and lockfile and repeat normal verification.
Do not replace the dependency with a local alias or invent a registry version.

The three BanSafe event retirements on monorepo branch
`fix/declared-webhook-events` are not in this API baseline. When that change is
integrated, update this contract, the SDK fixture list, CLI examples, and tests
together. This repair retains the two test fixtures the pinned API accepts.

## Runtime and authority

The API mounts trigger and fixture-list routes under `/messaging/testing`
when a simulated Sandbox client is configured. List requires `sandbox:read`;
trigger requires `sandbox:write`. Project/team credentials are accepted by the
API; client tokens are denied. The CLI's existing command specifically uses
its server-API-key path and requires an explicit `--project`.

Both routes check the live project and unified `test-numbers` feature.
This feature is a beta with release flag `release-test-numbers` and explicit
team enrollment. Missing enrollment, disabled release, or failed authority
does not grant access. No flag, credential, enrollment, or environment setting
changes in this repair.

Generated events use the test publication path and cannot change number
state. A real number is rejected. `--from-session` only permits
`message.received`, text-only overrides, and a different Test number in the
same project. The API limits triggering to 30 requests per project per minute.

Errors use the existing CLI mapping: validation/configuration exit 2,
authentication/authorization exit 3, not found/conflict exit 4, and rate limit,
network, timeout, or server failure exit 5. This command passes no idempotency
key, so the SDK does not automatically retry its POST. An uncertain response
must not be described as failed delivery. No new retry behavior is introduced.

## Impact and release checks

| Part             | State                                                      | Evidence or remaining work                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API              | Unaffected                                                 | Existing fixture and schema at the pinned revision; no handler, scope, or response change.                                                                                                                                                                     |
| SDKs             | Updated locally; publication blocked                       | Companion TypeScript catalog and override types, serializer tests, exact schema supplement, README. No new API method or other-language implementation is introduced.                                                                                          |
| CLI              | Updated locally; dependency blocked                        | Boolean parser and command regression tests. Await the inspected published SDK, then update the exact pin and lockfile.                                                                                                                                        |
| Docs             | Updated locally                                            | CLI README and SDK README cover the fixture and boolean input. Mintlify `docs/sandbox/test-events.mdx` already documents this existing API behavior. No shipped release announcement is added. Add CLI usage to public docs when the CLI is actually released. |
| Feature releases | Existing authority unchanged; live availability unverified | Existing Test numbers beta, targeting, enrollment and operational controls still apply. No provider or release setting was changed.                                                                                                                            |
| Admin            | Unaffected                                                 | Test fixtures add no durable setting or grant. Existing Test numbers release/enrollment and webhook controls remain the authority; generated events cannot create state needing a new staff action.                                                            |

Build and focused tests exercise a local HTTP receiver using the actual packed
SDK. They do not establish deployed beta availability, real webhook delivery,
listener delivery, or package publication. No automated reviews were requested.
