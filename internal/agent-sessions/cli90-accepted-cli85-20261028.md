# CLI #90 integration after accepted CLI #85

Collaborator: purpshell. Agent: gpt-6.1-sol, xhigh, T3 Code. Thread: 7793bd59-7f5e-4ad0-bcf2-8da9ea202931. Selected hand-authored evidence is recorded here with a full-transcript capture gap; no credentials, customer content or hidden reasoning is included.

## Source and preservation

Release accepted CLI85 main 637f9991342279133bb000a7db01574bcffaf174, source 541f9a01. CLI90 old 8b42b62cc18391567da0d786beff34c529b73d3c on base a9a19cd68eecf7f33eae495665c1f389b6906a5e was actually rebased with --rebase-merges onto live main 637f9991342279133bb000a7db01574bcffaf174. Rebased source: ae827188d429b1fc15a778107e39036a50d4c81a. The four feature commits and prior checkpoint retain their authored history/dates; original patches, bundle, index, conflict stages and range-diff are retained under backup/rebase-20261028-cli90-8b42b62c-after-cli85. JSON fields were reconciled semantically; the fixed Zod 4.6.7 floor, current graph and both script families remain. Installed dependencies match lock version/resolved/integrity, with foreign optional platforms explicitly excluded. No install ran.

## Verification

The pre-load tripwire failed before the guard and passed after shared unsupported metadata was applied. Loader/module, filesystem/configuration and installer tripwires prevent local effects. An independent artifact check failed while the old producer still bundled installer modules, then passed when the genuine producer used the same literal typed policy. Unsupported command IDs stay in the inventory with rejecting loaders. No generated inventory was hand-edited or old count hard-coded. The emitted artifact refuses setup before environment/fetch access, excludes installer/native module inputs, and preserves the real text-send POST/path/body/output using synthetic fetch only.

Fresh serial Node 24: 1164 tests in 118 files passed; format/lint/types/build/reference/metadata/browser artifact/pack/audit and installed Actionlint on both unchanged workflows passed. The targeted artifact build/recorder runs again after commit because its embedded Git identity changes. Exact metrics, artifact input graph and final source proof are retained privately and linked from the PR. Natural rewritten-head hosted jobs and review remain required; old-head green is not reused.

## Impact and gates

CLI source/producers and its README change. Accepted CLI85 process/helper/consent/native fixture and both workflows remain byte-identical. API and all six SDK wire/version/package pins are unchanged; the existing opaque-key SDK limitation remains. Docs #888 keeps its older source-bound bundle until its sole Opus owner accepts a new one. No Admin/MCP, runner, Temporal, audit, Inspector, Console, Connect, Help Center, marketing, ZK custody, QuickLink or browser pairing tunnel runtime changed. No UI/browser action, real installer, network API, registry, provider, migration or deployment effect occurred. Release owns merge; staging/availability gates remain and trackers were not synchronized.
