import console from 'node:console'
import process from 'node:process'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {
  registryEvidence,
  validateSdk,
  validateFeatureContractPins,
} from './release-evidence.mjs'

try {
  assert.equal(
    process.env.GITHUB_REF,
    'refs/heads/main',
    'CLI releases run only from main',
  )
  const channel = process.env.RELEASE_CHANNEL
  assert.ok(['nightly', 'stable'].includes(channel))
  const tag = channel === 'stable' ? 'latest' : 'dev'
  const output = resolve(process.env.RELEASE_OUTPUT)
  mkdirSync(output, {recursive: true, mode: 0o700})
  const sdk = await registryEvidence('@polymorfa/sdk', tag, output)
  assert.ok(
    sdk?.provenance,
    'SDK publication with matching API acceptance must finish first',
  )
  validateSdk(sdk.provenance, sdk.version, channel)
  validateFeatureContractPins(sdk.provenance, [
    JSON.parse(readFileSync('contracts/abprops-capabilities.json')),
    JSON.parse(readFileSync('contracts/interactive-messages.json')),
  ])
  const files = execFileSync('git', [
    'ls-files',
    '-z',
    'src',
    'bin',
    'scripts',
    'contracts',
    'skills',
    'package.json',
    'package-lock.json',
  ])
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort()
  const digest = createHash('sha256')
  for (const file of files)
    digest
      .update(file + '\0')
      .update(readFileSync(file))
      .update('\0')
  digest.update(sdk.version).update(sdk.integrity)
  const fingerprint = digest.digest('hex')
  const previous = await registryEvidence('@polymorfa/cli', tag, output)
  if (
    channel === 'nightly' &&
    previous?.provenance?.fingerprint === fingerprint
  ) {
    writeFileSync(process.env.GITHUB_OUTPUT, 'publish=false\n', {flag: 'a'})
    console.log('CLI and its exact SDK are already published; skipping nightly')
  } else {
    const pkg = JSON.parse(readFileSync('package.json'))
    const base = pkg.version.split('-')[0]
    const version =
      channel === 'stable'
        ? process.env.STABLE_VERSION
        : `${base}-dev.${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
    assert.match(
      version ?? '',
      channel === 'stable'
        ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
        : /^\d+\.\d+\.\d+-dev\.\d+$/,
    )
    if (previous?.version === version)
      assert.equal(
        previous.provenance?.fingerprint,
        fingerprint,
        'CLI version belongs to different source',
      )
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
    const provenance = {
      schemaVersion: 1,
      repository: 'polymorfa/cli',
      sourceSha,
      fingerprint,
      channel,
      packageVersion: version,
      sdkVersion: sdk.version,
      sdkIntegrity: sdk.integrity,
      sdk: sdk.provenance,
    }
    writeFileSync(
      join(output, 'release-contract.json'),
      JSON.stringify(provenance, null, 2) + '\n',
    )
    // Exact accepted SDK selection is a package build input; branches remain main.
    execFileSync(
      'npm',
      [
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--save-exact',
        `@polymorfa/sdk@${sdk.version}`,
      ],
      {stdio: 'inherit'},
    )
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `publish=true\nversion=${version}\nsdk=${sdk.version}\n`,
      {flag: 'a'},
    )
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
