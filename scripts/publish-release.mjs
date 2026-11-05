import process from 'node:process'
import {setTimeout as delay} from 'node:timers/promises'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {registryEvidence, validateSdk} from './release-evidence.mjs'

const output = resolve(process.env.RELEASE_OUTPUT)
const provenance = JSON.parse(
  readFileSync(join(output, 'release-contract.json')),
)
assert.equal(provenance.repository, 'polymorfa/cli')
assert.equal(provenance.sourceSha, process.env.GITHUB_SHA)
assert.equal(provenance.channel, process.env.RELEASE_CHANNEL)
validateSdk(provenance.sdk, provenance.sdkVersion, provenance.channel)
const version = provenance.packageVersion
assert.match(version, /^\d+\.\d+\.\d+(?:-dev\.\d+)?$/)
const tarball = join(output, `polymorfa-cli-${version}.tgz`)
const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
assert.equal(
  integrity,
  JSON.parse(readFileSync(join(output, 'pack.json')))[0].integrity,
)
assert.deepEqual(
  JSON.parse(
    execFileSync(
      'tar',
      ['-xzOf', tarball, 'package/dist/release-contract.json'],
      {encoding: 'utf8'},
    ),
  ),
  provenance,
)
const packed = JSON.parse(
  execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], {
    encoding: 'utf8',
  }),
)
assert.equal(packed.name, '@polymorfa/cli')
assert.equal(packed.version, version)
assert.equal(packed.dependencies['@polymorfa/sdk'], provenance.sdkVersion)
const sdk = await registryEvidence(
  '@polymorfa/sdk',
  provenance.sdkVersion,
  output,
)
assert.equal(sdk.integrity, provenance.sdkIntegrity)
assert.deepEqual(sdk.provenance, provenance.sdk)
const tag = provenance.channel === 'stable' ? 'latest' : 'dev'
let published = await registryEvidence('@polymorfa/cli', version, output)
if (!published) {
  execFileSync(
    'npm',
    [
      'publish',
      tarball,
      '--tag',
      tag,
      '--access',
      'public',
      '--provenance=false',
    ],
    {stdio: 'inherit'},
  )
  for (let attempt = 0; attempt < 12; attempt++) {
    published = await registryEvidence('@polymorfa/cli', version, output)
    if (published) break
    await delay(5000)
  }
}
assert.equal(
  published?.integrity,
  integrity,
  'Existing CLI package has different contents',
)
assert.equal(
  (await registryEvidence('@polymorfa/cli', tag, output))?.version,
  version,
  'CLI dist-tag requires repair before recording completion',
)
const receipt = provenance.sdk.acceptance
const events = (receipt.featureLinks ?? []).map((feature) => {
  const stage =
    provenance.channel === 'stable' ? 'stable_published' : 'nightly_published'
  const identity = {
    featureId: feature.id,
    deliveryLevel: 'cli',
    stage,
    sourceSha: receipt.sourceSha,
    apiVersion: receipt.apiVersion,
    packageVersions: {
      '@polymorfa/cli': version,
      '@polymorfa/sdk': provenance.sdkVersion,
    },
  }
  return {
    schemaVersion: 1,
    eventId: createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex'),
    ...identity,
    notionUrl: feature.notionUrl,
    linearIssueIds: feature.linearIssueIds,
    trackingStatus: feature.trackingStatus,
    environment: receipt.environment,
    evidenceUrl: receipt.runUrl,
    occurredAt: new Date().toISOString(),
  }
})
writeFileSync(
  join(output, 'stage-events.json'),
  JSON.stringify(events, null, 2) + '\n',
)
