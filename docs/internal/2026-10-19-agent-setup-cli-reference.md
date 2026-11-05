# Agent setup and CLI reference checkpoint

Owner: purpshell. Implementer: Codex through T3 Code, gpt-6.1-sol.
Date: 2026-10-19. The thread ID is not exposed in the supplied task context.
This is a sanitized checkpoint, not a complete transcript. It records visible
instructions and verification; it contains no hidden model reasoning or customer data.

## Scope and revisions

The owner requested implementation of two approved features: `polymorfa agent
setup` and a versioned machine-readable reference for the docs site's `/cli`
section. Work started from CLI `main` at
`c21af71f13e68230769d1a2ca17985d143bf6c6e` in a fresh task checkout. The older
prototype checkout and the supplied monorepo checkout were preserved.
Implementation commit: `925df16`. Branch: `feat/agent-setup-cli-reference`.

No CLI AGENTS.md, contribution guide, PR template, or shared skill bundle was
present. README and RELEASING.md were read. The parent task supplied the writing,
artifact-storage, sequential implementation, review, and release boundaries.
No delegated agents were used. The supplied scope already settled implementation
choices. No new permission was requested. No automated review was requested.

## Behavior and client evidence

- Claude Code 2.1.303 was found on PATH. Setup uses marketplace add followed by
  plugin install with the `polymorfa` marketplace and plugin names.
- Codex 0.163.0 was found on PATH. Local `codex --help`, `codex plugin --help`,
  `codex plugin add --help`, and `codex plugin marketplace add --help` advertise
  native plugin installation and Git marketplace sources.
- Codex upstream at `941b32bf57e520f506cda9741de615f64f53fbe6` accepts the
  `.claude-plugin/marketplace.json` layout. Its plugin list uses an `installed`
  array, and marketplace list uses a `marketplaces` array. Evidence:
  `codex-rs/core-plugins/src/marketplace.rs`, lines 20-24;
  `codex-rs/cli/src/plugin_cmd.rs`, lines 483-531;
  `codex-rs/cli/src/marketplace_cmd.rs`, lines 299-339.
- Gemini was absent on PATH. Its upstream installer documents `--consent` to
  avoid another confirmation after setup consent. Agent-kit declares the
  extension name `polymorfa` in `gemini-extension.json`.
- Cursor was absent on PATH but its configuration directory was present. Setup
  prints marketplace/repository instructions and does not edit Cursor settings.

Agent-kit did not yet expose `.claude-plugin/marketplace.json` during inspection.
The owner identified that manifest as parallel work. Native installer success
against the completed kit remains unverified.

## Verification

Node 24.15.0 was used for final verification.

- `npm ci` passed. Its all-dependency audit reported development advisories;
  `npm run audit:prod` later reported zero vulnerabilities.
- `npm run verify` passed: formatting, ESLint, TypeScript, 112 Vitest files and
  1,066 tests, build, one reference metadata test, stale-reference check,
  package dry-run, and production dependency audit.
- `node --test scripts/release-evidence.test.mjs`: three tests passed.
- Two complete `npm run docs:reference` runs produced 370 public commands and
  identical SHA-256 values:
  `7c4d538cdea4827634b64761ce848e230145b5b90c38f004b9691dc28cbe573d`.
- Built CLI help and `node bin/run.js agent setup --dry-run` passed. The exact
  dry-run output is included below and in the owning PR.
- Actionlint reported the existing `blacksmith-2vcpu-ubuntu-2404` runner label
  in `.github/workflows/ci.yml:15` as unknown. No workflow was changed or enabled.

```text
claude plugin marketplace add polymorfa/agent-kit
claude plugin install polymorfa@polymorfa
claude: dry-run (no installation performed).
codex plugin marketplace add polymorfa/agent-kit
codex plugin add polymorfa@polymorfa
codex: dry-run (no installation performed).
cursor: instructions. Install Polymorfa from the Cursor marketplace or https://github.com/polymorfa/agent-kit.
```

## Test harness incident and correction

An initial command-test mock did not intercept oclif's compiled-module import.
One test using `--yes` therefore ran the real setup path. That violated the
owner's dry-run-only instruction. No native installation success was observed.
Subsequent directory metadata inspection found no Polymorfa marketplace or cache
directories for Claude or Codex. Claude's plugin registry modification times were
2026-09-21, and Codex config modification time was 2026-10-17, both before this
session. No credential or configuration contents were opened for that inspection.

The harness now imports the command directly, supplies the repository root, mocks
the setup service, and throws if a real child process is spawned. Installer
behavior is tested with a mocked process runner. Corrected tests and the full
verification pass.

## Handoff and release boundaries

This change adds CLI behavior, README instructions, and the generated reference.
It changes no API contract, SDK pin, backend, Admin capability, or release gate.
The docs-site consumer and agent-kit marketplace work remain separate delivery
items. Linear and Notion records were not supplied or synchronized in this task.
No graphical UI changed; terminal help and output are the review evidence.
No npm package was published, PR merged, workflow enabled, or review requested.

A useful engineering write-up could explain how oclif's compiled command loader
bypasses source-module mocks, how to prohibit child processes in command tests,
and why native installer acceptance differs from a dry-run. No draft or public
publication was requested.
