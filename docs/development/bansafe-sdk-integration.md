# BanSafe SDK integration check

The BanSafe CLI commands depend on the matching typed SDK revision pinned in
`package.json`. During coordinated SDK and CLI development, verify both
worktrees without replacing that immutable dependency in either manifest:

The pinned SDK revision is `polymorfa/sdks@289c921793a71f52c7fa85e941f36c45fa72e653`.
Its coverage ledger is reconciled against the merged API contracts at
`polymorfa/polymorfa@1600403db9dcf7996dbbb882375b1165859829d3` (Platform
snapshot SHA-256
`c3c0d1107e8403c1ddc28649ca397eef35d82cd40be1674b3dc2ba5525a3590e`).

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

Before publishing the CLI, confirm that the pinned SDK revision remains
available, run `npm ci`, and run `npm run verify` from a fresh checkout. A
local-path install is integration evidence only; it is not a publishable
dependency.

The CLI mapping covers all 25 Platform BanSafe operations in the SDK coverage
ledger. The SDK also covers the 10 equivalent Messaging settings routes through
`MessagingClient.banSafe`; the CLI uses the Platform routes for those settings
because BanSafe commands authenticate with an organization server API key.

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
