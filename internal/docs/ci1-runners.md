# CLI checks on ci-1

The owner approved the GARM + Incus cutover and paused new paid CI runs. This
change qualifies the private CLI repository on disposable Linux workers. The
[coordinated plan](https://github.com/polymorfa/polymorfa/blob/d35de858d73fe9c6d9e6110637a18a3dfe57fb56/internal/docs/superpowers/plans/2026-10-19-ci1-runner-images-and-cutover.md)
owns the host, image, lifecycle proof and environment holds.

## Workflow and image contract

`ci1.yml` keeps the CI display name, Verify Node 22 check and all three existing
commands: `npm ci`, `npm run verify` and the release-evidence tests. It uses
`ci1-integration` with eight CPUs and 32 GiB RAM, a 20-minute job deadline, read-only
repository permission and no checkout credential persistence. The already qualified integration pool lets this CLI check run alongside the
monorepo general queue, within the unchanged host budget. Fork PRs run only a
failing guard on a GitHub-hosted runner, before checkout; the preserved Verify
Node 22 check fails instead of reporting a successful skip. Trusted source work
always uses ci-1. No source-test fallback exists.

The new file identity lets this PR qualify while old paid workflow 338004193
stays disabled. Do not enable the old identity before inspecting its source;
the default branch still selects Blacksmith until the cutover merges.

Before installation, the job validates the shared image's base fingerprint,
machine/tool input hashes, age of at most seven days, architecture and CPU shape.
It then verifies the image's checksum manifest with strict parsing; any malformed
line fails admission. Node setup selects cached Node 22. Existing npm cache behavior and the lockfile-based installation remain.
The image's pnpm cache belongs to the monorepo; no CLI npm-cache hit is inferred.
A changed image definition requires new qualification and explicit pin updates.

The qualified image fingerprint is
`505d3336ea46318175907ac2192df5002406731bd2990a344ba2ee98c1c89ab0`.
The controller's scale set 2 (`ci1-integration`) pins this exact final fingerprint;
scale set 1 does too. A live readback on 2026-10-19 confirmed both pins and the
fingerprint-named local Incus alias targeting that same fingerprint. The installed
provider wrapper SHA-256 also matches its committed source. The
[readback receipt](ci1-qualified-pool.json) records the binding. The controller
provider refuses remote or non-fingerprint image names and rejects retargeted
aliases. Image identity is bound by this controller configuration; the guest
manifest checks content and age. A new image needs explicit operator pool
changes and full qualification under the coordinated plan.

Its definition source is `6481b9e199d96fb3488f34d6335ac41169f4fb5d` in the monorepo.
The underlying Ubuntu base is
`2139edd9da4026da8a66c0557af7eee4789101104eb27860bacd57086219cebb`.
Public source dependencies only are installed; no customer credential, release
signing key or production secret is added to CI or the image.

## Qualification and rollout

Source dependency: CLI main `c21af71f13e68230769d1a2ca17985d143bf6c6e`.
Seven local admission tests cover the accepted image, wrong architecture/shape,
expiry/future clock, wrong base, changed/missing definition or tool hashes,
fork guard outcomes before checkout and malformed checksum rows. The two new
regressions failed before the fix and pass afterward; all source test commands
remain unchanged.
The unchanged local `npm run verify` passed all 110 test files and 1,051 tests,
types, lint, formatting, build, package dry-run and production audit (zero
production vulnerabilities). Three release-evidence tests also passed.
Local workflow lint and diff checks pass. GitHub source qualification and the
first main-branch run remain required. Host lifecycle proof is separate from CLI
source acceptance.

The publication workflow is unchanged. It runs on its schedule or manual
invocation, requires matching SDK/API acceptance and never runs merely because
this CI PR merges. This change does not authorize a package publication or
staging deployment. Staging and regional rename holds remain in force.

On a bad image, drain/rebuild the worker pool under the monorepo runbook and
qualify it again. Do not silently re-enable paid CI. Reverting the source change
does not re-enable workflow 338004193; paid resumption needs an owner cost decision.

## Impact and session provenance

CI and operator documentation are updated. CLI commands, credential handling,
SDK dependency, API contracts, public docs/changelog, product release flags,
Admin controls, billing, Usage, logs, analytics and customer interfaces are
unaffected because no runtime, dependency or product configuration changes.
No customer feature or release flag is introduced. Linear is unavailable in this
session; no tracker synchronization is claimed.

Collaborator purpshell; Codex/gpt-6.1-sol; T3 thread
`8ad9e447-6fd5-4fc5-8e96-189326af2c28`. The existing registration is
[monorepo PR 511](https://github.com/polymorfa/polymorfa/pull/511).
The [sanitized manual checkpoint](../agent-sessions/ci1-cli-20261019.md) records
visible instructions and tool outcomes, with capture gaps. It provides
provenance, not GitHub acceptance or release authority.
