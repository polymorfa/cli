import {Buffer} from 'node:buffer'
import {URL} from 'node:url'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

const {fetch, AbortSignal} = globalThis

export function validateSdk(provenance, version, channel) {
  assert.equal(provenance.schemaVersion, 1)
  assert.equal(provenance.repository, 'polymorfa/sdks')
  assert.match(provenance.sourceSha, /^[a-f0-9]{40}$/)
  assert.match(provenance.fingerprint, /^[a-f0-9]{64}$/)
  assert.equal(provenance.packageVersion, version)
  assert.equal(provenance.channel, channel)
  assert.match(
    version,
    channel === 'stable'
      ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
      : /^\d+\.\d+\.\d+-dev\.\d+$/,
  )
  const receipt = provenance.acceptance
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.repository, 'polymorfa/polymorfa')
  assert.equal(
    receipt.environment,
    channel === 'stable' ? 'production' : 'staging',
  )
  assert.match(receipt.sourceSha, /^[a-f0-9]{40}$/)
  assert.match(receipt.apiVersion, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(receipt.result, 'passed')
  assert.ok(
    receipt.scenarios?.length &&
      receipt.scenarios.every((s) => s.result === 'passed'),
  )
  assert.equal(receipt.deployment?.commit, receipt.sourceSha)
  assert.equal(receipt.deployment?.status, 'finished')
  assert.match(
    receipt.runUrl,
    /^https:\/\/github\.com\/polymorfa\/polymorfa\/actions\/runs\/\d+$/,
  )
  assert.ok(Number.isFinite(Date.parse(receipt.acceptedAt)))
  assert.deepEqual(Object.keys(receipt.contracts).sort(), [
    'messaging',
    'platform',
  ])
  for (const [name, spec] of Object.entries(receipt.contracts)) {
    assert.equal(
      spec.sourcePath,
      name === 'messaging'
        ? 'apps/api/docs/openapi.json'
        : 'apps/api/docs/openapi.management.json',
    )
    assert.match(spec.sha256, /^[a-f0-9]{64}$/)
  }
  return provenance
}
export async function registryEvidence(name, tag, output) {
  assert.ok(['@polymorfa/sdk', '@polymorfa/cli'].includes(name))
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
    {signal: AbortSignal.timeout(30_000), redirect: 'error'},
  )
  if (response.status === 404) return null
  assert.equal(response.status, 200, 'Registry release metadata unavailable')
  const pkg = await response.json()
  const url = new URL(pkg.dist.tarball)
  assert.equal(url.origin, 'https://registry.npmjs.org')
  assert.ok(!url.username && !url.password && !url.search && !url.hash)
  const tar = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  })
  assert.equal(tar.status, 200)
  const bytes = Buffer.from(await tar.arrayBuffer())
  assert.ok(bytes.length < 32 * 1024 * 1024)
  assert.equal(
    `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    pkg.dist.integrity,
  )
  const archive = join(
    output,
    name === '@polymorfa/sdk' ? 'accepted-sdk.tgz' : 'published-cli.tgz',
  )
  writeFileSync(archive, bytes, {mode: 0o600})
  const entries = execFileSync('tar', ['-tzf', archive], {
    encoding: 'utf8',
  }).split('\n')
  const provenance = entries.includes('package/dist/release-contract.json')
    ? JSON.parse(
        execFileSync(
          'tar',
          ['-xzOf', archive, 'package/dist/release-contract.json'],
          {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024},
        ),
      )
    : null
  if (provenance) assert.equal(provenance.packageVersion, pkg.version)
  return {version: pkg.version, integrity: pkg.dist.integrity, provenance}
}
