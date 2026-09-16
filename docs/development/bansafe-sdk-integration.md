# BanSafe SDK integration check

The BanSafe CLI commands depend on the matching typed SDK revision pinned in
`package.json`. During coordinated SDK and CLI development, verify both
worktrees without replacing that immutable dependency in either manifest:

The verified integrated Platform contract SHA-256 is
`d529a62ddcc8e5b661b90db7ca9a36dddc30ca48a6a016c4f6b46e0fd471b9df`.

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

The CLI mapping covers all 25 machine-permitted BanSafe operations in the SDK
coverage ledger:

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
