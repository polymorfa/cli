import {spawnSync} from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterEach, describe, expect, test} from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const tempDirectories: string[] = []
const pinnedSdk = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
).dependencies['@polymorfa/sdk']
type TestManifest = {
  version: string
  dependencies: Record<string, string>
  publishConfig: {tag: string}
}
type TestLock = {packages: Record<string, {integrity?: string}>}

function runWith(mutator?: (manifest: TestManifest, lock: TestLock) => void) {
  const temp = mkdtempSync(join(tmpdir(), 'polymorfa-cli-release-'))
  tempDirectories.push(temp)
  mkdirSync(join(temp, 'scripts'))
  cpSync(
    join(root, 'scripts/check-prerelease.mjs'),
    join(temp, 'scripts/check-prerelease.mjs'),
  )
  const manifest = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ) as TestManifest
  const lock = JSON.parse(
    readFileSync(join(root, 'package-lock.json'), 'utf8'),
  ) as TestLock
  mutator?.(manifest, lock)
  writeFileSync(join(temp, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(temp, 'package-lock.json'), JSON.stringify(lock))
  return spawnSync(
    process.execPath,
    [join(temp, 'scripts/check-prerelease.mjs'), manifest.version],
    {
      encoding: 'utf8',
    },
  )
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    rmSync(directory, {force: true, recursive: true})
})

describe('npm prerelease guard', () => {
  test('accepts the reviewed manifest and lockfile', () => {
    const result = runWith()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`@polymorfa/sdk@${pinnedSdk}`)
  })

  test('rejects the default latest tag', () => {
    const result = runWith((manifest) => {
      manifest.publishConfig.tag = 'latest'
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('public npm dev tag')
  })

  test('rejects SDK drift between manifest and lockfile', () => {
    const result = runWith((manifest) => {
      manifest.dependencies['@polymorfa/sdk'] = 'github:polymorfa/sdks#dev'
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('exact published dev prerelease')
  })

  test('rejects a lockfile without the published SDK integrity', () => {
    const result = runWith((_manifest, lock) => {
      delete lock.packages['node_modules/@polymorfa/sdk']!.integrity
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('SDK artifact and integrity')
  })
})
