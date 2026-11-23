import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {appendFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {log} from 'node:console'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath, pathToFileURL} from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const newline = String.fromCharCode(10)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))

export function sourceSdkPin(cliRoot) {
  const pin = json(join(cliRoot, 'contracts/connections.json'))
  if (pin.releaseStatus !== 'source-only') return null
  assert.equal(pin.repository, 'polymorfa/polymorfa')
  assert.equal(pin.sdk.repository, 'polymorfa/sdks')
  assert.equal(pin.sdk.publishedVersion, null)
  assert.match(pin.sourceCommit, /^[a-f0-9]{40}$/)
  assert.match(pin.sdk.sourceCommit, /^[a-f0-9]{40}$/)
  return pin
}

export function validateSourceSdk(cliRoot, sdkRoot) {
  const pin = sourceSdkPin(cliRoot)
  assert.ok(
    pin,
    'Source SDK preparation is only for an unpublished source candidate',
  )
  const git = (...args) =>
    execFileSync('git', ['-C', sdkRoot, ...args], {encoding: 'utf8'}).trim()
  assert.equal(
    git('rev-parse', 'HEAD'),
    pin.sdk.sourceCommit,
    'Wrong SDK source revision',
  )
  assert.equal(
    git('status', '--porcelain', '--untracked-files=all'),
    '',
    'SDK source or build inputs differ from the pinned commit',
  )
  const source = json(join(sdkRoot, 'contracts/source.json'))
  assert.equal(source.repository, pin.repository)
  assert.equal(source.commit, pin.sourceCommit, 'SDK/API producer mismatch')
  for (const family of ['messaging', 'platform']) {
    const snapshot = 'contracts/openapi.' + family + '.json'
    const input = source.contracts[family]
    assert.equal(input.snapshotPath, snapshot)
    assert.equal(input.sourcePath, pin.contracts[family].sourcePath)
    assert.equal(sha256(readFileSync(join(sdkRoot, snapshot))), input.sha256)
    assert.equal(
      input.sha256,
      pin.contracts[family].sha256,
      'SDK/API contract hash mismatch',
    )
  }
  assert.equal(
    json(join(sdkRoot, 'packages/typescript/package.json')).name,
    '@polymorfa/sdk',
  )
  return pin
}

export function prepareSourceSdk(cliRoot, sdkRoot) {
  const pin = validateSourceSdk(cliRoot, sdkRoot)
  assert.ok(process.env.npm_execpath, 'Run through npm run ci:sdk-source')
  const npm = (args, cwd, capture = false) =>
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: capture ? 'pipe' : 'inherit',
      maxBuffer: 16 * 1024 * 1024,
    })
  npm(['run', 'build'], sdkRoot)
  const artifacts = join(cliRoot, '.sdk-source/artifacts')
  mkdirSync(artifacts, {recursive: true})
  const packed = JSON.parse(
    npm(
      [
        'pack',
        '--workspace',
        '@polymorfa/sdk',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        artifacts,
      ],
      sdkRoot,
      true,
    ),
  )
  assert.equal(packed.length, 1)
  assert.equal(packed[0].name, '@polymorfa/sdk')
  const archive = join(artifacts, packed[0].filename)
  const archiveSha256 = sha256(readFileSync(archive))
  npm(
    [
      'install',
      '--no-save',
      '--package-lock=false',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      archive,
    ],
    cliRoot,
  )
  const installed = json(
    join(cliRoot, 'node_modules/@polymorfa/sdk/package.json'),
  )
  assert.equal(installed.name, '@polymorfa/sdk')
  assert.equal(installed.version, packed[0].version)
  validateSourceSdk(cliRoot, sdkRoot)
  const receipt = {
    schemaVersion: 1,
    kind: 'source-sdk-ci-artifact',
    sourceOnly: true,
    repository: pin.sdk.repository,
    sourceCommit: pin.sdk.sourceCommit,
    apiSourceCommit: pin.sourceCommit,
    archiveSha256,
    packageVersion: installed.version,
  }
  writeFileSync(
    join(cliRoot, '.sdk-source/source-receipt.json'),
    JSON.stringify(receipt, null, 2) + newline,
  )
  log(
    'Installed checked SDK source candidate ' +
      pin.sdk.sourceCommit +
      '. Publication remains gated.',
  )
  return receipt
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.includes('--github-output')) {
    const pin = sourceSdkPin(root)
    assert.ok(process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      'source_only=' +
        Boolean(pin) +
        newline +
        'ref=' +
        (pin?.sdk.sourceCommit ?? '') +
        newline,
    )
  } else {
    const index = process.argv.indexOf('--sdk-root')
    assert.ok(
      index >= 0 && process.argv[index + 1],
      '--sdk-root requires the exact SDK checkout',
    )
    prepareSourceSdk(root, resolve(root, process.argv[index + 1]))
  }
}
