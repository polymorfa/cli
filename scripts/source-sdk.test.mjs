import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {after, test} from 'node:test'
import {sourceSdkPin, validateSourceSdk} from './source-sdk.mjs'

const task = join(
  homedir(),
  '.polymorfa-agent-work',
  'connections-cli-source-sdk-tests',
)
mkdirSync(task, {recursive: true})
const scratch = mkdtempSync(join(task, 'case-'))
after(() => rmSync(scratch, {recursive: true, force: true}))
let ordinal = 0
function fixture() {
  const base = join(scratch, String(++ordinal)),
    sdk = join(base, 'sdk'),
    cli = join(base, 'cli')
  mkdirSync(join(sdk, 'packages/typescript'), {recursive: true})
  mkdirSync(join(sdk, 'contracts'), {recursive: true})
  mkdirSync(join(cli, 'contracts'), {recursive: true})
  const producer = 'a'.repeat(40),
    contracts = {},
    cliContracts = {}
  function save(path, data) {
    writeFileSync(path, JSON.stringify(data, null, 2))
  }
  for (const family of ['messaging', 'platform']) {
    const snapshotPath = `contracts/openapi.${family}.json`,
      sourcePath = `apps/api/docs/${family}.json`
    save(join(sdk, snapshotPath), {
      openapi: '3.1.0',
      info: {title: family, version: 'synthetic'},
    })
    const sha256 = createHash('sha256')
      .update(readFileSync(join(sdk, snapshotPath)))
      .digest('hex')
    contracts[family] = {snapshotPath, sourcePath, sha256}
    cliContracts[family] = {sourcePath, sha256}
  }
  save(join(sdk, 'packages/typescript/package.json'), {
    name: '@polymorfa/sdk',
    version: '0.0.0-synthetic',
  })
  save(join(sdk, 'package.json'), {name: 'synthetic-workspace', private: true})
  save(join(sdk, 'contracts/source.json'), {
    repository: 'polymorfa/polymorfa',
    commit: producer,
    contracts,
  })
  const git = (...args) =>
    execFileSync('git', ['-C', sdk, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Synthetic source check')
  git('config', 'user.email', 'fixture@example.invalid')
  git('add', '.')
  git(
    '-c',
    'core.hooksPath=',
    'commit',
    '--no-gpg-sign',
    '-m',
    'Synthetic SDK source',
  )
  const pin = {
    repository: 'polymorfa/polymorfa',
    sourceCommit: producer,
    releaseStatus: 'source-only',
    contracts: cliContracts,
    sdk: {
      repository: 'polymorfa/sdks',
      sourceCommit: git('rev-parse', 'HEAD'),
      publishedVersion: null,
    },
  }
  const savePin = () => save(join(cli, 'contracts/connections.json'), pin)
  savePin()
  return {sdk, cli, pin, savePin, git, save}
}

test('accepts only the exact clean SDK source and matching API snapshots', () => {
  const f = fixture()
  assert.deepEqual(validateSourceSdk(f.cli, f.sdk), f.pin)
})
test('rejects a different SDK commit', () => {
  const f = fixture()
  f.pin.sdk.sourceCommit = 'b'.repeat(40)
  f.savePin()
  assert.throws(
    () => validateSourceSdk(f.cli, f.sdk),
    /Wrong SDK source revision/,
  )
})
test('rejects dirty build inputs outside the TypeScript package', () => {
  const f = fixture()
  f.save(join(f.sdk, 'package.json'), {scripts: {build: 'changed'}})
  assert.throws(
    () => validateSourceSdk(f.cli, f.sdk),
    /source or build inputs differ/,
  )
})
test('rejects an untracked build input', () => {
  const f = fixture()
  writeFileSync(join(f.sdk, 'unexpected.mjs'), 'synthetic')
  assert.throws(
    () => validateSourceSdk(f.cli, f.sdk),
    /source or build inputs differ/,
  )
})
test('rejects an API producer mismatch even at the pinned SDK commit', () => {
  const f = fixture()
  f.pin.sourceCommit = 'c'.repeat(40)
  f.savePin()
  assert.throws(
    () => validateSourceSdk(f.cli, f.sdk),
    /SDK\/API producer mismatch/,
  )
})
test('rejects a contract hash mismatch', () => {
  const f = fixture()
  f.pin.contracts.platform.sha256 = 'd'.repeat(64)
  f.savePin()
  assert.throws(() => validateSourceSdk(f.cli, f.sdk), /contract hash mismatch/)
})
test('does not substitute source artifacts for a published cohort', () => {
  const f = fixture()
  f.pin.releaseStatus = 'published'
  f.pin.sdk.publishedVersion = '1.0.0'
  f.savePin()
  assert.equal(sourceSdkPin(f.cli), null)
  assert.throws(
    () => validateSourceSdk(f.cli, f.sdk),
    /only for an unpublished source candidate/,
  )
})
