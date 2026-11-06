# CLI PR 85 findings checkpoint

Collaborator: purpshell. Agent: Codex through T3 Code, gpt-6.1-sol.
Date: 2026-10-21. Thread ID was not supplied to this implementation sub-agent.
Registration: https://github.com/polymorfa/polymorfa/pull/511.

This manual checkpoint summarizes visible instructions and selected tool results.
It is not a full transcript. It excludes credentials, customer content and hidden
model reasoning. The existing checkpoint remains historical.

## Scope and revisions

The user authorized repairs, a normal merge from main, commits and a normal push
for https://github.com/polymorfa/cli/pull/85. They prohibited merging the PR,
requesting reviews, dispatching publication and publishing packages.

Work used a new clone under ~/.polymorfa-agent-work/cli85-findings/cli.
The starting branch was feat/agent-setup-cli-reference at
e5a31892d49f4d0b862f3e20ef605c22a352aa0b. The checkout was clean.
No AGENTS.md, CLAUDE.md, scoped guidance, PR template or skill bundle exists in
this CLI checkout. The parent supplied repository guidance and writing policy.
The parent grill-me/grilling and unslop instructions were read; the task already
settled implementation choices. No sub-agents or automated reviews were requested.

The agent read package scripts, README, RELEASING.md, both workflows, inline
review comments and issue comments. origin/main at
58e91a18d1a4afc108eb3119db0830340bb2a926 merged without conflicts in
7cd46aa47617d5fe94e8caf7f071438001004ec7. This brings in ci-hosted.yml with
GitHub-hosted Ubuntu, Node 22 and the preserved verification commands.
The publication workflow only runs for main and was not dispatched or modified.

## Findings and changes

- CodeRabbit Windows launch: valid. The detector accepts npm .cmd shims while
  spawn previously disabled the shell everywhere. Enable the shell on win32
  only. Mocked spawn tests assert Windows, Linux and macOS options.
- CodeRabbit flat marketplace source and Codex P1: the same valid defect.
  Accept sibling repo/url fields when source is a string; preserve nested
  sources and exact repository allowlisting. Tests cover matching flat GitHub,
  flat Git URL and nested Claude entries, conflicting/unknown flat sources,
  and the existing nested Codex behavior.
- Codex P2 reference examples: valid. Render command.id using the current
  space-separated command ID. Both string and object examples have regressions.
- Codex P2 consent: valid. Ask once immediately before the first mutation.
  Instruction-only, already-installed, unavailable and conflicting clients need
  no consent. Tests cover consent acceptance/decline and multiple clients.
- CodeRabbit's issue-comment docstring percentage is an advisory, not a failing
  repository check. No blanket docstring changes or bot automation were invoked.

New regressions failed against the original implementation: ten Vitest cases
and the reference example test. They pass after the fixes. Initial full
verification found require-await violations in new test callbacks; those were
corrected without changing check configuration or assertions.

## Verification

The initial npm ci passed under the host Node 26.12.0. Final verification used
Node 22.23.3 through npx --package=node@22 to match hosted CI.

- npm run docs:reference regenerated 381 public commands, including main's new
  campaign commands and restored command names in examples.
- npm run verify passed formatting, ESLint, typecheck, 115 Vitest files and
  1,116 tests, build, one reference metadata test, reference drift check,
  package dry-run and production audit with zero vulnerabilities.
- node --test scripts/release-evidence.test.mjs: three passed.
- npm run docs:reference:check: passed separately.
- Actionlint passed ci-hosted.yml and publish-dev.yml.
- git diff --check passed.
- Built CLI checks used disposable fake client executables with a restricted
  PATH, no personal client installs and no credential reads. Cursor and
  unsupported Codex returned instructions with exit 0 without --yes. Claude
  without --yes returned exit 1 without fixture mutation. Claude with --yes
  preserved a flat matching marketplace and invoked only the fake installer.
- Native Windows launch and installation against real agent clients were not
  exercised. Platform options and installer behavior have mocked coverage.

contracts/cli-reference.json changed. SHA-256:
b7f979ac2e44da98bc6faaca581f1cdbf73d82ac04bbe38f95e4e29527fac9a4.
The schema remains version 1. Docs consumers must vendor this updated file from
this PR's resulting revision. No docs-site repository was changed.

## Impact and release boundaries

Repairs affect the local CLI setup service, reference generator, generated JSON,
README and tests. They do not change API contracts, the SDK pin, backend runtime,
Admin controls, billing, logs, audit logs, customer Analytics or feature flags.
No graphical UI changed. No native client installation, package publication,
deployment or customer acceptance is claimed. No Linear or Notion record was
supplied or synchronized. Hosted CI results belong in the owning PR's current
verification section after the normal push.

Rollback reverts the repair commit and regenerates the reference against the
retained main revision. Native installer changes, if separately performed by a
user, require that client's uninstall procedure. No release rollback occurred.
