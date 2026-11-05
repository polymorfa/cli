# CLI85 bounded Windows process lifecycle

Collaborator: purpshell. Agent: gpt-6.1-sol, xhigh, T3 Code. Thread: 7793bd59-7f5e-4ad0-bcf2-8da9ea202931. This hand-authored checkpoint records selected visible evidence, with a full-transcript capture gap. It contains no credentials, customer data or hidden reasoning.

## Verified cause

Release authorized the same writer to fix review 4396931101. Previous head d0141c3d9b4043bc1ab35f570a898856233cacd1 is retained at backup/cli85-windows-lifecycle-before-20261028-d0141c3d. Its hosted checks were terminal before the successor. Windows used a shell whose child could keep stdout open after timeout; settlement depended on close. The deadline regression failed on old source and passed after bounded cleanup/failure settlement. Sources: https://nodejs.org/download/release/v24.15.0/docs/api/child_process.html#event-close and https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill.

## Behavior and verification

Each command retains its 120-second work deadline. Windows cleanup targets only the captured owned PID with direct taskkill arguments and has a separate five-second bound. Timeout/overflow remain failures even after a successful late close. Failed cleanup never reports installed. An already-exited PID is not re-targeted. The inherited stdout handle is destroyed and unreferenced on completion; normal success waits for complete stdout. The 1 MiB limit counts UTF-8 bytes; the overflow regression failed before byte accounting and passes afterward. Fixed-token grammar, POSIX literal argument arrays, consent and private-output protections remain.

Fresh Node 24 local proof: 54 affected tests, full serial CLI suite, formatting, lint, typecheck, build, 381-command reference, four metadata tests, package dry-run and production audit passed. Native fixture syntax passed; Windows execution is NOT local proof. The natural Windows job must pass before merge. The owned .cmd/Node fixture checks readiness before advancing the requested 120-second clock, retains a real wall watchdog/cleanup, and asserts both fixture PIDs are gone and setupAgents reports failed. No real agent installer or API call ran.

## Workflow and scope

CI owner and Release approved one job in the existing GitHub-hosted workflow. Ubuntu verify is unchanged. CI concurrency cancels superseded PR runs. The Windows job fails build/fixture errors without skip fallback or continue-on-error. Existing action pins, contents:read and persist-credentials:false remain. CI blob: 885f49003bffa883bdccc550d2f74734db994004. Publisher blob stays byte-identical at 993b2f319603b3ae3c2a1c74c10f83c18ce1df1e, preserving its separate non-canceling group, schedule, manual controls and gates. Installed Actionlint version/exit-zero logs for BOTH files are retained under the private cli85-windows-lifecycle-20261028 packet. No dispatch, rerun or review was requested.

API and all six SDK contracts/credentials are unchanged. CLI source, README, tests and its existing CI workflow are the only implementation surfaces. Docs888 retains its source-bound bundle; its sole Opus owner must accept any future binding. CLI90 stays held for actual accepted CLI85 main, then needs registry/pre-load refusal integration. No Admin control/MCP, runners, Temporal, audit, Inspector, Console, Connect, Help Center, marketing, ZK custody, QuickLink or browser pairing tunnel code changed. Native test success is not native installer/provider, registry or environment acceptance. No publication or deployment is authorized. Release retains merge execution; the finding awaits actual native tree-cleanup proof. Trackers were not synchronized.
