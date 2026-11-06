import {readFileSync} from 'node:fs'
import console from 'node:console'
import process from 'node:process'
import {URL} from 'node:url'

const expectedVersion = process.argv[2]
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url)),
)
const lock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url)),
)
const sdk = manifest.dependencies['@polymorfa/sdk']

function fail(message) {
  throw new Error(`CLI prerelease check: ${message}`)
}

if (!/^0\.\d+\.\d+-dev\.\d+$/.test(expectedVersion ?? '')) {
  fail('provide an explicit 0.x dev prerelease version')
}
if (
  manifest.name !== '@polymorfa/cli' ||
  manifest.version !== expectedVersion
) {
  fail('package name or version does not match the requested release')
}
if (lock.name !== manifest.name || lock.version !== expectedVersion) {
  fail('root lockfile identity does not match package.json')
}
if (
  lock.packages[''].name !== manifest.name ||
  lock.packages[''].version !== expectedVersion
) {
  fail('root lockfile package does not match package.json')
}
if (!/^0\.\d+\.\d+-dev\.\d+$/.test(sdk)) {
  fail('the SDK must be an exact published dev prerelease')
}
if (lock.packages[''].dependencies['@polymorfa/sdk'] !== sdk) {
  fail('the root lockfile does not pin the SDK version')
}
const installedSdk = lock.packages['node_modules/@polymorfa/sdk']
if (
  installedSdk?.version !== sdk ||
  !installedSdk.integrity?.startsWith('sha512-')
) {
  fail('the lockfile lacks the exact SDK artifact and integrity')
}
if (
  manifest.publishConfig?.access !== 'public' ||
  manifest.publishConfig?.registry !== 'https://registry.npmjs.org/' ||
  manifest.publishConfig?.tag !== 'dev' ||
  manifest.publishConfig?.provenance !== false
) {
  fail(
    'publication must target the public npm dev tag without private-source provenance',
  )
}

console.log(`${manifest.name}@${expectedVersion} pins @polymorfa/sdk@${sdk}`)
