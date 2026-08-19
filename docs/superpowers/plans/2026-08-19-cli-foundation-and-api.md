# Polymorfa CLI Foundation and Raw API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an installable `polymorfa` executable with trustworthy version reporting, consistent global output behavior, SDK-backed credential resolution, and a `gh api`-inspired raw API command exercised against a real local HTTP server.

**Architecture:** Oclif command classes remain thin and delegate to focused TypeScript modules for output, environment resolution, raw-request parsing, and SDK execution. The CLI imports only the public root of `@polymorfa/sdk`; tests exercise command behavior and a real local HTTP boundary rather than SDK mocks.

**Tech Stack:** Node.js 20+, TypeScript 6, ESM, `@oclif/core` 4, `@polymorfa/sdk@0.1.0-dev.0`, Vitest 3, `@oclif/test` 4, ESLint 9, Prettier 3, npm.

**Spec:** `docs/superpowers/specs/2026-08-19-polymorfa-cli-design.md`

## Global Constraints

- The source repository remains private while the npm package name is public: `@polymorfa/cli` with binary `polymorfa`.
- Runtime is ESM on Node.js 20 or newer.
- Development pins `@polymorfa/sdk` to `github:polymorfa/sdks#b8cf1aba3cdb120287657a608e1a3a9bc8c302b6`.
- The first npm release is blocked until the SDK is available as a public npm semver dependency.
- The CLI imports only the SDK package root and never duplicates its HTTP transport, authentication validation, retries, cancellation, metadata, pagination, or typed errors.
- Secrets are never accepted as command-line arguments, written to project files, printed in verbose logs, or included in error context.
- Human-readable output goes to stdout, diagnostics go to stderr, and machine formats contain no spinners, colors, or commentary.
- Command UX is handwritten; raw API access does not replace curated high-frequency workflows.
- Each behavior is implemented test-first and each task ends with a focused commit.

## File Structure

- `package.json`: npm identity, exact runtime dependency contract, scripts, oclif discovery, and public package metadata.
- `package-lock.json`: reproducible dependency graph including the exact SDK Git revision.
- `bin/run.js`: production ESM executable using oclif `execute`.
- `bin/dev.js`: development ESM executable using oclif development discovery.
- `tsconfig.json`: strict editor and test typechecking.
- `tsconfig.build.json`: production compilation from `src/` to `dist/`.
- `eslint.config.js`: typed TypeScript lint rules without requiring Node 20.19.
- `vitest.config.ts`: Vitest behavior with oclif console interception disabled.
- `src/base-command.ts`: inherited global flags and shared rendering helpers.
- `src/commands/version.ts`: CLI and SDK version command.
- `src/commands/api.ts`: thin raw API command adapter.
- `src/context/environment.ts`: non-secret runtime settings and credential selection from environment variables.
- `src/sdk/client.ts`: construction of public SDK clients and selection of `RawClient`.
- `src/api/request.ts`: HTTP method, endpoint, header, query, and JSON-body normalization.
- `src/api/execute.ts`: SDK raw request execution and result shaping.
- `src/output/render.ts`: deterministic text and JSON output.
- `src/errors/present.ts`: stable error categories, exit codes, request IDs, and redaction.
- `test/commands/version.test.ts`: user-visible version command behavior.
- `test/commands/api.test.ts`: raw command behavior against a real local HTTP server.
- `test/output/render.test.ts`: deterministic renderer behavior.
- `test/errors/present.test.ts`: safe SDK and unknown error presentation.
- `test/helpers/http-server.ts`: test-owned local HTTP server lifecycle and request capture.
- `.github/workflows/ci.yml`: Node 20 and 22 verification.
- `README.md`: verified development install, command examples, environment contract, and release caveat.

---

### Task 1: Package foundation and version command

**Files:**

- Create: `package.json`
- Create: `bin/run.js`
- Create: `bin/dev.js`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `test/commands/version.test.ts`
- Create: `src/commands/version.ts`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `README.md`
- Generate: `package-lock.json`

**Interfaces:**

- Consumes: `SDK_VERSION: string` from the public `@polymorfa/sdk` package root.
- Produces: oclif command id `version`; compiled executable `bin/run.js`; npm scripts `build`, `test`, `typecheck`, `format:check`, and `lint`.

- [ ] **Step 1: Add package and tool configuration without a command implementation**

Use `@oclif/core` `^4.13.5`, `@oclif/test` `^4.1.22`, TypeScript `^6.0.3`, Vitest `3.2.7`, ESLint `^9.39.5`, `typescript-eslint` `^8.67.0`, and Prettier `^3.9.6`. Configure `package.json` with `type: "module"`, `engines.node: ">=20"`, `bin.polymorfa: "./bin/run.js"`, `files: ["bin", "dist", "README.md", "LICENSE"]`, and oclif command discovery at `./dist/commands`.

`bin/run.js` must contain:

```js
#!/usr/bin/env node
import {execute} from '@oclif/core'

await execute({dir: import.meta.url})
```

`bin/dev.js` must contain:

```js
#!/usr/bin/env -S node --import tsx
import {execute} from '@oclif/core'

await execute({development: true, dir: import.meta.url})
```

Set `vitest.config.ts` to `disableConsoleIntercept: true`. Configure production TypeScript output as NodeNext ESM in `dist/`, with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, declarations, and source maps enabled.

- [ ] **Step 2: Install dependencies and confirm the empty project typechecks**

Run: `npm install`

Run: `npm run typecheck`

Expected: PASS with no TypeScript diagnostics and a lockfile whose SDK resolution ends at commit `b8cf1aba3cdb120287657a608e1a3a9bc8c302b6`.

- [ ] **Step 3: Write the failing version command test**

```ts
import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

describe('version', () => {
  test('prints the CLI and SDK development versions', async () => {
    const result = await runCommand('version')

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('polymorfa/0.1.0-dev.0 sdk/0.1.0-dev.0\n')
    expect(result.stderr).toBe('')
  })
})
```

- [ ] **Step 4: Run the version test and verify RED**

Run: `npm test -- test/commands/version.test.ts`

Expected: FAIL because oclif cannot find the `version` command.

- [ ] **Step 5: Implement the minimal version command**

```ts
import {Command} from '@oclif/core'
import {SDK_VERSION} from '@polymorfa/sdk'

export default class Version extends Command {
  static override description = 'Print the Polymorfa CLI and SDK versions.'

  async run(): Promise<void> {
    this.log(`polymorfa/${this.config.version} sdk/${SDK_VERSION}`)
  }
}
```

- [ ] **Step 6: Verify GREEN and the packed executable**

Run: `npm test -- test/commands/version.test.ts`

Expected: PASS with one test.

Run: `npm run build && node bin/run.js version`

Expected stdout: `polymorfa/0.1.0-dev.0 sdk/0.1.0-dev.0`

Run: `npm pack --dry-run --ignore-scripts`

Expected: tarball contains `bin/run.js`, `dist/commands/version.js`, declarations, README, and LICENSE; it contains no tests, source files, or private packages.

- [ ] **Step 7: Commit the package foundation**

```bash
git add package.json package-lock.json bin tsconfig.json tsconfig.build.json vitest.config.ts src/commands/version.ts test/commands/version.test.ts .gitignore LICENSE README.md
git commit -m "Build installable CLI foundation"
```

### Task 2: Global output and safe error presentation

**Files:**

- Create: `src/base-command.ts`
- Create: `src/output/render.ts`
- Create: `src/errors/present.ts`
- Create: `test/output/render.test.ts`
- Create: `test/errors/present.test.ts`
- Modify: `src/commands/version.ts`
- Modify: `test/commands/version.test.ts`

**Interfaces:**

- Consumes: `PolymorfaError`, `ResponseMetadata`, and oclif `Flags`.
- Produces: `OutputMode`, `renderValue(value, mode)`, `presentError(error)`, `PresentedError`, and `BaseCommand.baseFlags`.

- [ ] **Step 1: Add failing user-visible tests for JSON and quiet version output**

Append tests that assert:

```ts
test('prints one JSON document without terminal commentary', async () => {
  const result = await runCommand('version --json')

  expect(result.error).toBeUndefined()
  expect(JSON.parse(result.stdout)).toEqual({
    cli: '0.1.0-dev.0',
    sdk: '0.1.0-dev.0',
  })
  expect(result.stderr).toBe('')
})

test('prints nothing in quiet mode', async () => {
  const result = await runCommand('version --quiet')

  expect(result.error).toBeUndefined()
  expect(result.stdout).toBe('')
  expect(result.stderr).toBe('')
})
```

- [ ] **Step 2: Run the command tests and verify RED**

Run: `npm test -- test/commands/version.test.ts`

Expected: both new tests FAIL because `--json` and `--quiet` are unknown.

- [ ] **Step 3: Implement deterministic output and inherited global flags**

Define:

```ts
export type OutputMode = 'human' | 'json' | 'quiet'

export function renderValue(
  value: unknown,
  mode: OutputMode,
): string | undefined {
  if (mode === 'quiet') return undefined
  if (mode === 'json') return `${JSON.stringify(value)}\n`
  return `${String(value)}\n`
}
```

Define `BaseCommand` with inherited flags `--json`, `--quiet`, `--no-color`, `--profile`, `--organization`, `--project`, `--api-version`, `--timeout`, and `--verbose`. Make `--json` and `--quiet` mutually exclusive. Add `outputMode(flags)` and `writeValue(value, human)` helpers that write only to stdout.

Change `version` to extend `BaseCommand`, parse its flags, and render `{cli, sdk}` in JSON or the existing literal in human mode.

- [ ] **Step 4: Run the version tests and verify GREEN**

Run: `npm test -- test/commands/version.test.ts`

Expected: all three version behaviors PASS.

- [ ] **Step 5: Write failing error-presentation tests**

Use an actual SDK configuration error and a plain `Error`:

```ts
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'
import {presentError} from '../../src/errors/present.js'

describe('presentError', () => {
  test('preserves the SDK category without exposing a credential value', () => {
    const error = new PolymorfaConfigurationError(
      'Credential pmfa_secret-value is invalid.',
      'credential',
    )

    expect(presentError(error, ['pmfa_secret-value'])).toEqual({
      category: 'configuration',
      exitCode: 2,
      message: 'Credential [REDACTED] is invalid.',
    })
  })

  test('uses the internal category for an unknown error', () => {
    expect(presentError(new Error('socket exploded'))).toEqual({
      category: 'internal',
      exitCode: 1,
      message: 'socket exploded',
    })
  })
})
```

- [ ] **Step 6: Run the error tests and verify RED**

Run: `npm test -- test/errors/present.test.ts`

Expected: FAIL because `presentError` does not exist.

- [ ] **Step 7: Implement stable error categories and literal redaction**

Define:

```ts
export interface PresentedError {
  readonly category:
    | 'authentication'
    | 'authorization'
    | 'configuration'
    | 'conflict'
    | 'not_found'
    | 'rate_limit'
    | 'timeout'
    | 'validation'
    | 'network'
    | 'server'
    | 'cancelled'
    | 'internal'
  readonly exitCode: number
  readonly message: string
  readonly requestId?: string
}

export function presentError(
  error: unknown,
  secrets: readonly string[] = [],
): PresentedError
```

Map public SDK subclasses to stable categories, use exit code 2 for configuration/validation, 3 for authentication/authorization, 4 for conflict/not-found, 5 for rate-limit/network/server/timeout, 130 for cancellation, and 1 for unknown errors. Replace every non-empty literal secret occurrence with `[REDACTED]`. Include `requestId` only when the public SDK error exposes one.

- [ ] **Step 8: Verify output and error suites, then commit**

Run: `npm test -- test/commands/version.test.ts test/output/render.test.ts test/errors/present.test.ts`

Expected: PASS with no stdout/stderr warnings.

```bash
git add src/base-command.ts src/output src/errors src/commands/version.ts test/commands/version.test.ts test/output test/errors
git commit -m "Standardize CLI output and errors"
```

### Task 3: Environment context and SDK raw-client selection

**Files:**

- Create: `src/context/environment.ts`
- Create: `src/sdk/client.ts`
- Create: `test/context/environment.test.ts`
- Create: `test/sdk/client.test.ts`

**Interfaces:**

- Consumes: public `MessagingClient`, `PlatformClient`, `RawClient`, `MessagingCredential`, and SDK validation.
- Produces: `ApiSurface`, `ResolvedEnvironment`, `resolveEnvironment(input)`, and `createRawClient(environment)`.

- [ ] **Step 1: Write failing environment-resolution tests**

```ts
import {describe, expect, test} from 'vitest'
import {resolveEnvironment} from '../../src/context/environment.js'

describe('resolveEnvironment', () => {
  test('resolves a platform server key without returning unrelated environment values', () => {
    expect(
      resolveEnvironment({
        env: {
          POLYMORFA_API_KEY: 'pmfa_test-key',
          POLYMORFA_BASE_URL: 'http://127.0.0.1:4567',
          UNRELATED_SECRET: 'do-not-copy',
        },
        surface: 'platform',
        timeoutMs: 5000,
      }),
    ).toEqual({
      surface: 'platform',
      credential: {type: 'apiKey', value: 'pmfa_test-key'},
      baseUrl: 'http://127.0.0.1:4567',
      timeoutMs: 5000,
    })
  })

  test('rejects a client token for the Platform surface', () => {
    expect(() =>
      resolveEnvironment({
        env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser'},
        surface: 'platform',
      }),
    ).toThrow('Platform API requests require POLYMORFA_API_KEY')
  })
})
```

- [ ] **Step 2: Run the environment tests and verify RED**

Run: `npm test -- test/context/environment.test.ts`

Expected: FAIL because `resolveEnvironment` does not exist.

- [ ] **Step 3: Implement explicit environment resolution**

Define:

```ts
export type ApiSurface = 'messaging' | 'platform'

export interface ResolvedEnvironment {
  readonly surface: ApiSurface
  readonly credential:
    | {readonly type: 'apiKey'; readonly value: string}
    | {readonly type: 'clientToken'; readonly value: string}
  readonly baseUrl?: string
  readonly apiVersion?: string
  readonly timeoutMs?: number
}
```

`resolveEnvironment` reads only `POLYMORFA_API_KEY`, `POLYMORFA_CLIENT_TOKEN`, `POLYMORFA_BASE_URL`, and explicit non-secret flag overrides. Platform accepts only `POLYMORFA_API_KEY`. Messaging prefers an explicitly present client token only when no server key exists; simultaneous key and token values produce an ambiguity error rather than guessing. Do not mutate `process.env`.

- [ ] **Step 4: Verify environment tests GREEN**

Run: `npm test -- test/context/environment.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing raw-client boundary tests**

Create a real `PlatformClient` and `MessagingClient` through `createRawClient`, then assert each return value is an SDK `RawClient`. Add a negative test proving the SDK rejects `pmfa_ct_` when passed to Platform; do not mock constructors.

- [ ] **Step 6: Run the raw-client tests and verify RED**

Run: `npm test -- test/sdk/client.test.ts`

Expected: FAIL because `createRawClient` does not exist.

- [ ] **Step 7: Implement SDK client construction without transport duplication**

```ts
export function createRawClient(environment: ResolvedEnvironment): RawClient {
  const shared = {
    ...(environment.baseUrl === undefined
      ? {}
      : {baseUrl: environment.baseUrl}),
    ...(environment.apiVersion === undefined
      ? {}
      : {apiVersion: environment.apiVersion}),
    ...(environment.timeoutMs === undefined
      ? {}
      : {timeoutMs: environment.timeoutMs}),
  }

  if (environment.surface === 'platform') {
    return new PlatformClient({apiKey: environment.credential.value, ...shared})
      .raw
  }

  return new MessagingClient({credential: environment.credential, ...shared})
    .raw
}
```

- [ ] **Step 8: Verify and commit environment/client selection**

Run: `npm test -- test/context/environment.test.ts test/sdk/client.test.ts`

Expected: PASS.

```bash
git add src/context src/sdk test/context test/sdk
git commit -m "Resolve SDK clients from safe environment context"
```

### Task 4: Raw API command vertical slice

**Files:**

- Create: `src/api/request.ts`
- Create: `src/api/execute.ts`
- Create: `src/commands/api.ts`
- Create: `test/helpers/http-server.ts`
- Create: `test/commands/api.test.ts`
- Modify: `src/errors/present.ts`

**Interfaces:**

- Consumes: `BaseCommand`, `resolveEnvironment`, `createRawClient`, and SDK `RawRequest`/`ApiResponse`.
- Produces: command id `api`; `buildRawRequest(input)`; `executeRawRequest(client, request)`.

- [ ] **Step 1: Write the failing GET integration test against a real local server**

Start an HTTP server on `127.0.0.1` with an ephemeral port. Run:

```ts
const result = await runCommand('api /v1/projects --surface platform --json', {
  env: {
    POLYMORFA_API_KEY: 'pmfa_test-key',
    POLYMORFA_BASE_URL: server.baseUrl,
  },
})
```

Have the server respond with JSON `{data: [{id: 'project_1'}]}` and headers `request-id: req_123`, `content-type: application/json`. Assert the real received request uses `GET /v1/projects` and `authorization: Bearer pmfa_test-key`. Assert stdout JSON equals:

```json
{
  "data": {"data": [{"id": "project_1"}]},
  "metadata": {"status": 200, "requestId": "req_123", "attempts": 1}
}
```

Do not assert on an SDK mock.

- [ ] **Step 2: Run the GET integration test and verify RED**

Run: `npm test -- test/commands/api.test.ts`

Expected: FAIL because the `api` command is not found.

- [ ] **Step 3: Implement minimal request normalization and GET execution**

Define command syntax `polymorfa api <endpoint>`. Add flags:

- `--surface <messaging|platform>` required until a linked context can select it;
- `--method <GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS>` default `GET`;
- repeatable `--header <name:value>`;
- repeatable `--field <name=value>` for string query values on GET/HEAD and JSON object fields on body methods;
- `--input <path|->` for a complete JSON body;
- `--include` to include response metadata in human output;
- inherited global flags.

Reject endpoints that do not begin with `/`. Reject simultaneous `--input` and `--field`. Reject a body for GET or HEAD. Parse headers at the first colon and fields at the first equals sign; reject empty names. Read `--input -` from stdin with a 10 MiB bound. Use `client.request(request)` and return SDK data plus request metadata; do not call `fetch` directly.

- [ ] **Step 4: Run the GET integration test and verify GREEN**

Run: `npm test -- test/commands/api.test.ts`

Expected: PASS and the captured request proves the SDK transport was used correctly.

- [ ] **Step 5: Add failing POST, validation, and redaction integration tests**

Add separate tests proving:

- `api /v1/campaigns --surface platform --method POST --field name=Launch --field projectId=project_1 --json` sends the literal JSON object and returns metadata;
- an endpoint without a leading slash exits with validation category and code 2 before the server receives a request;
- `--input` plus `--field` exits with validation category and code 2;
- an SDK 401 response includes its request ID but neither the authorization header nor `pmfa_test-key` in stderr;
- `--quiet` emits no response body but preserves the nonzero failure exit status.

- [ ] **Step 6: Run the expanded API tests and verify RED**

Run: `npm test -- test/commands/api.test.ts`

Expected: the new POST/validation/error cases FAIL for their missing branches while the GET case remains green.

- [ ] **Step 7: Implement the remaining request and error branches**

Keep parsing in `src/api/request.ts`, SDK invocation in `src/api/execute.ts`, and oclif adaptation in `src/commands/api.ts`. Present human success as pretty-printed JSON when the response is structured data and plain text otherwise. Present `--json` as one compact JSON document. Write errors to stderr as one compact JSON object under `--json`, otherwise `Error: <message>` plus `Request ID: <id>` when available.

- [ ] **Step 8: Verify the full API vertical slice and commit**

Run: `npm test -- test/commands/api.test.ts test/context/environment.test.ts test/sdk/client.test.ts test/errors/present.test.ts`

Expected: PASS with no leaked credential values in captured output.

Run: `npm run typecheck && npm run build`

Expected: PASS.

```bash
git add src/api src/commands/api.ts src/errors/present.ts test/commands/api.test.ts test/helpers/http-server.ts
git commit -m "Add SDK-backed raw API command"
```

### Task 5: CI, package verification, and user documentation

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierignore`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-19-polymorfa-cli-design.md`

**Interfaces:**

- Consumes: all commands and npm scripts from Tasks 1-4.
- Produces: repeatable Node 20/22 CI and a development package contract ready for the next feature plan.

- [ ] **Step 1: Add lint, formatting, and package scripts**

Configure flat ESLint for `src/**/*.ts`, `test/**/*.ts`, and `vitest.config.ts` using `typescript-eslint` recommended type-checked rules. Add scripts:

```json
{
  "build": "tsc -p tsconfig.build.json",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "lint": "eslint .",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "verify": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm pack --dry-run --ignore-scripts"
}
```

- [ ] **Step 2: Run formatting and focused verification**

Run: `npm run format`

Run: `npm run lint && npm run typecheck && npm test && npm run build`

Expected: all checks PASS without warnings.

- [ ] **Step 3: Document only behavior proved by the tests**

README must include:

- exact Git-development installation and `npm link` instructions;
- Node.js 20 requirement;
- `polymorfa version` examples;
- `polymorfa api /v1/projects --surface platform --json` using `POLYMORFA_API_KEY` from the environment;
- `POLYMORFA_CLIENT_TOKEN` scope for Messaging only;
- the development-only `POLYMORFA_BASE_URL` override;
- machine-output and exit behavior;
- the explicit warning that no npm release exists yet.

Update the design spec's delivery status with the exact implemented commands and leave all unimplemented command families described as planned, not shipped.

- [ ] **Step 4: Add Node 20 and 22 hosted CI**

Use `actions/checkout@v6`, `actions/setup-node@v6`, `npm ci`, and `npm run verify`. Set workflow permissions to `contents: read`. Do not add npm publishing in this task.

- [ ] **Step 5: Run complete local verification**

Run: `npm run verify`

Expected: formatting, lint, strict typecheck, all tests, build, and package dry-run PASS.

Run: `node bin/run.js version`

Expected: `polymorfa/0.1.0-dev.0 sdk/0.1.0-dev.0`

Run: `git status --short`

Expected: only the intended Task 5 files are modified.

- [ ] **Step 6: Commit and push the verified foundation**

```bash
git add .github eslint.config.js .prettierignore package.json package-lock.json README.md docs/superpowers/specs/2026-08-19-polymorfa-cli-design.md
git commit -m "Verify CLI foundation across Node versions"
git push origin dev
```

- [ ] **Step 7: Follow up with the SDK rewrite task**

Send the SDK task the exact CLI commit, the operations used, any public SDK friction observed, and the next typed-resource priorities. Ask it to continue coverage only for credential-compatible customer routes, preserve root public type exports, and avoid adding browser or dashboard-JWT dependencies to the server SDK.

## Plan Self-Review

- Spec coverage for this sub-project: package identity, SDK-only transport, global output, safe credentials, raw API escape hatch, errors, request IDs, Node support, CI, and documentation each map to a task above.
- Deliberately separate plans: persistent profiles/keychain, context/linking, domain commands, client-token workflows, MCP, skills, `listen`, completions, and updater behavior remain outside this first independently testable slice.
- Placeholder scan: every task names exact files, interfaces, commands, expected failures, expected outputs, and commit boundaries.
- Type consistency: `ResolvedEnvironment` feeds `createRawClient`; `createRawClient` returns SDK `RawClient`; `buildRawRequest` returns SDK `RawRequest`; `BaseCommand` owns shared flags and output.
