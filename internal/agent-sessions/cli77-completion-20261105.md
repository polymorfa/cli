# Calls CLI completion, 2026-11-05

Existing source owner: Calls thread `707f87c6-ff4d-4525-8150-0815c879e03a`.
Agent: Codex gpt-6.1-sol through T3 Code, default service tier. No source child
or competing writer was started. Registration: polymorfa/polymorfa#540.
This checkpoint records visible instructions and tool results, not a complete
transcript. Raw host capture is unavailable; no hidden reasoning is included.

## Source and correction

Owning PR: https://github.com/polymorfa/cli/pull/77.
Preserved source parent: `9fae00c78c5b2c25ff0519590ceaa5a8a13bd064`.
Actual main integrated without conflicts: `044f8b75ae8b0689664fe489c22d4a3c64486717`.
The three authored feature/coverage commits remain ancestors. The original
clean index, source bundle and backup refs were saved before integration.
The spent runner barrier and its historical receipts were not changed.

The pinned published SDK predates the simultaneous-calls validator. Updates
containing that setting now use the same SDK client's authenticated raw PUT
transport after the CLI's risk checks, with the encoded Platform session path.
Other settings-only updates retain the typed SDK method. Standalone enable and
disable send only requested fields. SDK transport errors, API authorization
and revision refusals remain intact. The SDK pin and local response-type
extensions remain; no unpublished package or new transport was substituted.

The existing real CLI-reference producer rebuilt the artifact from compiled
commands. It exports 381 visible commands; only the two call-settings command
entries differ from main. The actual browser-registry producer finds 382 source
commands, with two local-only loaders excluded. Its committed registry bytes
are unchanged. No generated output was edited manually.

The required production audit found GHSA-g3hv-75wg-m249 in oclif's minimatch.
A scoped oclif override selects published minimatch 11.0.4 and its generated
lock entry. The command framework and SDK versions remain unchanged. The
patched dependency supports the CLI's Node 22 minimum. Advisory:
https://github.com/advisories/GHSA-g3hv-75wg-m249.

## Pre-commit checks

Runtime: Node 22.23.2. Normal npm setup used the actual manifest and lockfile.
All checks below passed on the combined source before this commit:

- `npm run verify`: formatting, ESLint, TypeScript, 118 test files and 1,169
  tests, build, reference metadata test and exact-byte reference check, actual
  browser producer/bundle checks, package dry-run and production audit.
- `node --test scripts/cli-reference.test.mjs scripts/release-evidence.test.mjs`:
  four tests passed, none skipped.
- Calls/BanSafe focused checks: 59 passed, including standalone on/off,
  authorization, stale revisions, encoded session paths and exact bodies.
- Generated reference contains only the two expected command metadata changes;
  browser registry stays byte-identical. `git diff --check` passed.
- Production audit: zero vulnerabilities. Development-dependency audit notices
  are not represented as a clean all-dependency audit.

Private logs and producer bindings are retained under
`~/.polymorfa-agent-work/simultaneous-calls/cli77-completion-20261105/`.
Hosted CI and required code/security reviews must qualify the published head;
these local results do not establish their success.

## Impact and release limits

CLI flags, terminal rendering, command research and generated reference are
updated. SDK compatibility is handled in the CLI against its unchanged exact
published pin. No library, runner, Temporal, API, schema, Admin/MCP, Inspector,
Console, public docs-site, Help Center or marketing source is changed here.
No credential, privacy, billing, meter, audit, analytics, enrollment, feature
flag or availability authority changes. In particular, the exclusion timestamp
never establishes insurance coverage and is never sent in a settings update.

Backend and SDK source dependencies were merged previously; their publication
and deployed acceptance remain separate release gates. This task grants no
package, tag, deployment, provider, database or production action. Merge waits
for the complete owning stack's required hosted CI, clean code/security reviews
and cleared findings. Rollback is a source revert; server-side acknowledgment,
credential and revision rules remain the authority.
