# BanSafe SDK integration check

The BanSafe CLI commands depend on the matching typed SDK version pinned in
`package.json`.

## SDK dependency

The CLI installs `@polymorfa/sdk` from npm. Each merge to the `dev` branch of
`polymorfa/sdks` publishes a prerelease under the `dev` dist-tag, versioned
`0.1.0-dev.<UTC timestamp YYYYMMDDHHmmss>` (for example
`0.1.0-dev.20260919094454`). Later builds always sort higher. See
`docs/releasing.md` in `polymorfa/sdks`.

Pin one exact version, never a range or the `dev` tag, so every install and
published CLI resolves the same SDK build:

```shell
npm view @polymorfa/sdk dist-tags          # find the newest dev build
npm install --save-exact @polymorfa/sdk@0.1.0-dev.<timestamp>
npm ci && npm run verify
```

Git-commit pins (`github:polymorfa/sdks#<sha>`) no longer work. The SDK lives
in `packages/typescript` of a private workspace root, and npm installs the
repository root.

The CLI pins `0.1.0-dev.20260922102711`, the first build published from npm
with provenance. The last git pin was
`polymorfa/sdks@94bfd09825817f842434e206e6a77adb5cc0c414`.

## Coordinated SDK and CLI development

During coordinated SDK and CLI development, verify both worktrees without
replacing the pinned dependency in either manifest. The Calls client ships in
the same package as `@polymorfa/sdk/calls`. The SDK coverage ledger at the last
git pin is reconciled against the API contracts at
`polymorfa/polymorfa@aca849cda44ad8582d7ae87489404d2483173a53` (Platform
snapshot SHA-256
`2a30e8e0af8902703609f8ed0f5bb2c108b39c5c11863d5ebd8907e56a9f25d2`).

```shell
export POLYMORFA_SDK_CHECKOUT=/absolute/path/to/bansafe-health-sdk
export POLYMORFA_CLI_CHECKOUT=/absolute/path/to/bansafe-health-cli

cd "$POLYMORFA_SDK_CHECKOUT"
npm install --ignore-scripts
npm run build
npm run typecheck
npx vitest run packages/typescript/test/bansafe.test.ts

cd "$POLYMORFA_CLI_CHECKOUT"
npm install --ignore-scripts
npm install --no-save --package-lock=false "$POLYMORFA_SDK_CHECKOUT"
npm run typecheck
npx vitest run test/commands/bansafe.test.ts
npm run build
```

Before publishing the CLI, confirm that the pinned SDK version is published
(`npm view @polymorfa/sdk@<version> version`), run `npm ci`, and run `npm run verify` from a fresh checkout. A
local-path install is integration evidence only; it is not a publishable
dependency.

The CLI mapping covers all 25 Platform BanSafe operations in the SDK coverage
ledger. The SDK also covers the 10 equivalent Messaging settings routes through
`MessagingClient.banSafe`; the CLI uses the Platform routes for those settings
because BanSafe commands authenticate with an team key.

| SDK operations                                               | CLI commands                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `banSafe.listHealth`, `getHealth`, `listHealthHistory`       | `bansafe health list`, `view`, `history`                   |
| `banSafe.listSignals`                                        | `bansafe signal list`                                      |
| `banSafe.getTelemetry`, `listTelemetryHistory`               | `bansafe telemetry view`, `history`                        |
| `banSafe.listCollection`                                     | `bansafe collection list`                                  |
| `banSafe.listHealthActions`                                  | `bansafe health-action list`                               |
| `banSafe.listFindings`                                       | `bansafe finding list`                                     |
| `banSafe.listEnforcement`                                    | `bansafe enforcement list`                                 |
| `banSafe.listIncidents`, `createIncident`, `retractIncident` | `bansafe incident list`, `report`, `retract`               |
| `banSafe.listClaims`, `getClaim`                             | `bansafe claim list`, `view`                               |
| `projects.getSafeMode`, `updateSafeMode`                     | `bansafe safe-mode view`, `update` with `--project`        |
| `sessions.getSafeMode`, `updateSafeMode`                     | `bansafe safe-mode view`, `update` with a session argument |
| `projects.getWarmupPlan`, `updateWarmupPlan`                 | `bansafe warmup view`, `update`                            |
| `projects.getHealthPolicy`, `updateHealthPolicy`             | `bansafe health-policy view`, `update`                     |
| `projects.getInsuranceEvidence`, `updateInsuranceEvidence`   | `bansafe insurance-evidence view`, `update`                |

Finding acknowledgement and enforcement appeal are dashboard-identity
operations. They are intentionally absent from both the server SDK and CLI.
