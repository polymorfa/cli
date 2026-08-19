# Authentication Profiles Implementation Plan

> **For Codex:** Execute this plan task by task using test-driven development.

**Goal:** Add secure persistent API-key profiles and make them available to the
existing SDK-backed command path without ever writing credentials to plaintext.

**Architecture:** A versioned JSON profile repository owns non-secret metadata
and an injected credential-store interface owns secrets. The production store
uses the operating-system keyring. Context resolution keeps explicit
environment credentials at highest precedence, then loads a selected or active
profile. Thin oclif commands call profile services and render redacted results.

**Tech stack:** TypeScript, ESM, Oclif 4, `@polymorfa/sdk`,
`@napi-rs/keyring`, Vitest.

---

## Task 1: Versioned profile configuration

**Files:**

- Create: `src/config/paths.ts`
- Create: `src/config/profiles.ts`
- Test: `test/config/profiles.test.ts`

Write failing tests for OS-specific paths, `POLYMORFA_CONFIG_DIR`, missing
configuration, schema validation, atomic writes, and non-secret serialized
metadata. Implement the smallest injectable filesystem-backed repository that
passes them.

## Task 2: Fail-closed secure credential storage

**Files:**

- Create: `src/config/credentials.ts`
- Test: `test/config/credentials.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

Write failing tests for profile-specific accounts, get/set/delete behavior,
missing credentials, and surfaced keyring failures. Add `@napi-rs/keyring` and
implement the production adapter behind a small injectable interface. Do not
add a plaintext fallback.

## Task 3: Profile services and resolution precedence

**Files:**

- Create: `src/services/auth.ts`
- Modify: `src/context/environment.ts`
- Modify: `src/sdk/client.ts`
- Test: `test/services/auth.test.ts`
- Modify: `test/context/environment.test.ts`

Write failing tests for login, list, use, status, logout, duplicate/replacement
behavior, and environment-over-profile precedence. Validate API-key shape with
the SDK before storage. Preserve client-token environment support for
Messaging.

## Task 4: Authentication commands

**Files:**

- Create: `src/commands/auth/login.ts`
- Create: `src/commands/auth/logout.ts`
- Create: `src/commands/auth/status.ts`
- Create: `src/commands/auth/list.ts`
- Create: `src/commands/auth/use.ts`
- Test: `test/commands/auth.test.ts`

Write failing command tests first. `login --with-api-key` reads bounded stdin,
never accepts a secret value as an argument, and activates the stored profile.
Browser login exits with an actionable prerequisite message until a backend
device flow exists. All successful results have human and JSON forms.

## Task 5: Integrate, document, and verify

**Files:**

- Modify: `src/commands/api.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-19-polymorfa-cli-design.md`

Make `api` resolve a named or active profile after checking environment
credentials. Update user-facing development documentation without claiming
browser login or npm publication. Run format, lint, typecheck, tests, build,
pack dry-run, production audit, and a clean packed-install smoke test. Commit
and push only this repository's changes to `dev`.
