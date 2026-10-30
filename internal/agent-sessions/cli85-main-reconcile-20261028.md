# CLI 85 current-main reconciliation

Collaborator: purpshell. T3 Code/Codex, gpt-6.1-sol, xhigh.
Thread: 7793bd59-7f5e-4ad0-bcf2-8da9ea202931.
Registration: https://github.com/polymorfa/polymorfa/pull/511.

This selected hand-authored checkpoint records visible source and validation evidence. It is not a full transcript import and contains no credentials, customer content or hidden reasoning. No new agent/writer was started. The CLI has no AGENTS.md or skill bundle; RELEASING.md, README, source/test consumers and the parent's supplied guidance/writing policy apply.

## Source and ownership

The user explicitly continued this thread's existing CLI 85/90 ownership and authorized normal source merges/pushes while Release owns PR merging. The correct existing CLI 85 repair checkout was clean at e5e8efd88443afa2f8b081d1ee8fbcd430c5a351. Active branch searches, the previous repair checkpoint and path-matched process inventory found no other current writer. The older e5a31892 checkout was left untouched.

Snapshot status, refs, index and patches are retained privately under cli85-90-integration-20261028/85/before. Actual main a9a19cd68eecf7f33eae495665c1f389b6906a5e was normal-merged into b465da9977b762a541fc5f9e25f1d6b2b5f6c3de, preserving authored history. Merge parents are e5e8efd8 and a9a19cd6. The merge changed dependency metadata only; repaired agent setup, command metadata generator and reference JSON are unchanged.

## New combined-source qualification

Node 24.15, bounded standard shared-wrapper claim, serial one-worker Vitest:

- Format, ESLint and typecheck passed.
- 115 Vitest files / 1,116 tests passed.
- Build passed; reference metadata and release-evidence tests passed 4/4.
- Reference drift check passed 381 public commands.
- Package dry-run passed; production audit reported 0 vulnerabilities.

No installer, npm ci, pull or service was run. The old installed tree was preserved. For this qualification only, a reversible node_modules link reused CLI 90's already-installed tree. All 197 applicable lock entries matched version/resolved/integrity, with 86 explicitly optional foreign-platform packages excluded and zero missing/mismatched applicable entries. Required Zod 4.6.7 and MCP 2.3.1 were present. The original node_modules directory was restored afterward. This is local reused-dependency proof, not a fresh clean install or Node 22 hosted acceptance.

Qualified runtime source is b465da9977b762a541fc5f9e25f1d6b2b5f6c3de. This checkpoint adds evidence only; current runtime source hashes remain identical. New-head hosted checks must independently qualify the final PR head. The previous Node 22 success is historical and is not relabelled.

Both workflows retain the exact source checked by installed Actionlint v1.7.12, exit 0: ci-hosted.yml blob d640123636864bd5107b7ad7ff5fea586664ab43 and publish-dev.yml blob 993b2f319603b3ae3c2a1c74c10f83c18ce1df1e. No workflow or publication command was dispatched.

## Review and dependency order

All five existing review threads were resolved on the repaired source; the fixes are preserved. Historical reviewer comments and rate-limit statuses are not fresh final-head approval. No automated review requested.

CLI 85 should land before CLI 90. The latter must keep both the reference verification scripts and browser build, regenerate its command registry to include agent setup, and refuse local agent setup in the browser before probing or spawning. No Docs/source binding is updated by this CLI task.

## Impact and limits

API and all six SDK contracts/pins are unchanged. CLI setup/reference behavior is retained; current main's security dependency fix is integrated. Docs consumers still need their own accepted source refresh, owned by the existing Docs/Opus lane. No Docs, frontend/shared UI, marketing, Inspector, Console or Admin source was changed. Admin API/MCP capabilities and flags are unchanged. Backend libraries, runners/Bartender, Temporal, Logs, billing/PAYG, Usage, customer Analytics and consented tracking are unchanged.

ZK custody, QuickLink and its browser pairing tunnel are not exercised by setup/reference generation; the generators inspect command metadata and tests use mocked subprocesses/fixtures. No real client installer, personal config, credential or provider effect was performed. Native Windows/client acceptance, API/SDK acceptance, clean hosted install, feature release and registry publication remain separate gates. Linear/Notion synchronization is not claimed. Staging deployment is deferred.

Release chooses and executes merges. No PR merge, tag, registry publication, deployment or broad API/SDK rebind occurred. Rollback uses a normal source revert and regeneration, not history rewriting or package replacement.

## Review follow-up on current main

Corrected narrative spacing without changing recorded values. The new process regression reproduced 11 failures against the old helper, then all 41 focused process, setup and command tests passed after the repair. Node 24.15.0 reproduced DEP0190 with harmless Node version commands using an argument array with shell enabled; the command/options overload emitted no warning. Source: https://nodejs.org/download/release/v24.15.0/docs/api/deprecations.html#DEP0190.

Production callers use the fixed client enum and AGENT_KIT constants. Windows rejects tokens outside that fixed grammar before spawning, and uses one command string with the command/options overload. POSIX retains direct execution and literal arguments. The 120-second timeout, 1 MiB output bound, withheld child errors and installation-consent ordering are unchanged. Typecheck, lint, build, the 381-command reference check and four release/metadata tests passed under Node 24.15.0. Native Windows and real client installation remain unverified. Earlier full-suite and hosted Node 22 results qualify their recorded source only; this head requires fresh hosted checks.

The actual rebase-merges onto main a9a19cd68eecf7f33eae495665c1f389b6906a5e was a no-op at 04f725791bbe7dd4da4e64f89aeb7c5deb0d83a2. The old remote head is preserved at backup/rebase-20261028-cli85-04f72579. The existing impact assessment remains applicable: this changes the local CLI process adapter and its tests, not API/SDK contracts, Admin authority, ZK custody, QuickLink or its browser pairing tunnel. Package publication and environment acceptance remain separate gates. This hand-authored checkpoint records selected visible evidence; it is not a complete tool transcript.
