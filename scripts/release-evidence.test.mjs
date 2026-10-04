import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateSdk} from './release-evidence.mjs'
const sdk = {
  schemaVersion: 1,
  repository: 'polymorfa/sdks',
  sourceSha: 'a'.repeat(40),
  fingerprint: 'b'.repeat(64),
  channel: 'nightly',
  packageVersion: '0.1.0-dev.20261004020000',
  acceptance: {
    schemaVersion: 1,
    repository: 'polymorfa/polymorfa',
    sourceSha: 'c'.repeat(40),
    apiVersion: '2026-09-22',
    environment: 'staging',
    result: 'passed',
    scenarios: [{result: 'passed'}],
    deployment: {commit: 'c'.repeat(40), status: 'finished'},
    runUrl: 'https://github.com/polymorfa/polymorfa/actions/runs/123',
    acceptedAt: '2026-10-04T02:00:00Z',
    contracts: {
      messaging: {
        sourcePath: 'apps/api/docs/openapi.json',
        sha256: 'd'.repeat(64),
      },
      platform: {
        sourcePath: 'apps/api/docs/openapi.management.json',
        sha256: 'e'.repeat(64),
      },
    },
  },
}
test('CLI pins an exact SDK with the matching environment acceptance', () => {
  assert.equal(validateSdk(sdk, sdk.packageVersion, 'nightly'), sdk)
  assert.throws(() => validateSdk(sdk, '0.1.0-dev.1', 'nightly'))
  assert.throws(() => validateSdk(sdk, sdk.packageVersion, 'stable'))
  const production = {
    ...sdk,
    channel: 'stable',
    packageVersion: '0.1.0',
    acceptance: {...sdk.acceptance, environment: 'production'},
  }
  assert.equal(validateSdk(production, '0.1.0', 'stable'), production)
  assert.throws(() =>
    validateSdk({...production, acceptance: sdk.acceptance}, '0.1.0', 'stable'),
  )
})
test('an installed SDK or healthy API without native route acceptance is insufficient', () => {
  for (const delta of [
    {result: 'failed'},
    {scenarios: []},
    {deployment: {commit: 'f'.repeat(40), status: 'finished'}},
    {contracts: {}},
  ])
    assert.throws(() =>
      validateSdk(
        {...sdk, acceptance: {...sdk.acceptance, ...delta}},
        sdk.packageVersion,
        'nightly',
      ),
    )
})
