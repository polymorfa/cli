import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  AccountDeviceProfileRepository,
  AccountDeviceStorageError,
  SecureAccountDeviceCredentials,
  accountDeviceCredentialAccount,
  type AccountDeviceProfile,
} from '../../src/account-device/storage.js'

const roots: string[] = []
const TOKEN = 'synthetic-opaque-account-session'

async function fixture() {
  const base = join(
    homedir(),
    '.polymorfa-agent-work',
    'region-owner-rebase-20261028',
    'cli86-account-device-storage-tests-20261105',
  )
  await mkdir(base, {recursive: true, mode: 0o700})
  const directory = await mkdtemp(join(base, 'case-'))
  roots.push(directory)
  return {
    directory,
    repo: new AccountDeviceProfileRepository(
      join(directory, 'account-device.json'),
    ),
  }
}
function profile(name = 'own'): AccountDeviceProfile {
  return {
    kind: 'accountDevice',
    issuer: 'https://api.account.example.invalid',
    consoleOrigin: 'https://console.account.example.invalid',
    userId: 'own-user',
    sessionId: 'own-session',
    expiresAtMs: 2_000_000_000_000,
    credentialAccount: accountDeviceCredentialAccount(name),
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0))
    await rm(root, {recursive: true, force: true})
})

describe('separate account-device metadata and keyring', () => {
  it('stores only metadata under a distinct file with private permissions', async () => {
    const {repo, directory} = await fixture()
    const machine = join(directory, 'config.json')
    const old =
      '{"version":2,"profiles":{"machine":{"credential":{"kind":"apiKey","account":"profile:machine:apiKey"}}}}\n'
    await writeFile(machine, old)
    expect(await repo.load()).toEqual({
      version: 1,
      revision: null,
      profiles: {},
    })
    const entry = profile()
    const saved = await repo.saveIfRevision(null, {
      version: 1,
      activeProfile: 'own',
      profiles: {own: entry},
    })
    expect(saved.profiles.own).toEqual(entry)
    expect(saved.revision).not.toBeNull()
    expect(Object.isFrozen(saved)).toBe(true)
    expect(Object.isFrozen(saved.profiles.own)).toBe(true)
    expect((await stat(repo.path)).mode & 0o777).toBe(0o600)
    expect(await readFile(machine, 'utf8')).toBe(old)
    expect(await readFile(repo.path, 'utf8')).not.toContain(TOKEN)
    await expect(stat(`${repo.path}.lock`)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('refuses stale mutations without removing a newer login or another profile', async () => {
    const {repo} = await fixture(),
      own = profile(),
      other = profile('other')
    const first = await repo.saveIfRevision(null, {
      version: 1,
      activeProfile: 'own',
      profiles: {own},
    })
    const second = await repo.saveIfRevision(first.revision, {
      version: 1,
      activeProfile: 'other',
      profiles: {own, other},
    })
    await expect(
      repo.saveIfRevision(first.revision, {version: 1, profiles: {}}),
    ).rejects.toMatchObject({code: 'changed'})
    expect(await repo.load()).toEqual(second)
  })

  it('permits exactly one concurrent writer with the same snapshot', async () => {
    const {repo} = await fixture()
    const attempts = await Promise.allSettled(
      ['left', 'right'].map((name) =>
        repo.saveIfRevision(null, {
          version: 1,
          activeProfile: name,
          profiles: {[name]: profile(name)},
        }),
      ),
    )
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      attempts.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1)
    expect(Object.keys((await repo.load()).profiles)).toHaveLength(1)
  })

  it('refuses an existing product metadata lock without touching it', async () => {
    const {repo} = await fixture()
    const path = `${repo.path}.lock`
    await writeFile(path, 'synthetic-existing-product-writer', {flag: 'wx'})
    await expect(
      repo.saveIfRevision(null, {version: 1, profiles: {}}),
    ).rejects.toMatchObject({code: 'busy'})
    expect(await readFile(path, 'utf8')).toBe(
      'synthetic-existing-product-writer',
    )
    expect(await repo.load()).toEqual({
      version: 1,
      revision: null,
      profiles: {},
    })
  })

  it.each([
    {version: 2, profiles: {}},
    {version: 1, revision: 'bad', profiles: {}},
    {
      version: 1,
      revision: '11111111-1111-4111-8111-111111111111',
      profiles: {},
      token: TOKEN,
    },
  ])(
    'refuses machine/unknown/raw-secret config shapes without fallback: %j',
    async (value) => {
      const {repo} = await fixture()
      await writeFile(repo.path, JSON.stringify(value))
      await expect(repo.load()).rejects.toBeInstanceOf(
        AccountDeviceStorageError,
      )
    },
  )

  it('refuses raw token fields, cross-profile references, repointing and orphan project selectors', async () => {
    const {repo} = await fixture(),
      own = profile()
    for (const bad of [
      {...own, token: TOKEN},
      {...own, credentialAccount: 'profile:own:apiKey'},
      {...own, credentialAccount: accountDeviceCredentialAccount('other')},
      {...own, issuer: 'https://api.account.example.invalid/override'},
      {...own, projectId: '22222222-2222-4222-8222-222222222222'},
    ]) {
      await expect(
        repo.saveIfRevision(null, {version: 1, profiles: {own: bad}}),
      ).rejects.toMatchObject({code: 'invalid'})
    }
    expect((await repo.load()).revision).toBeNull()
  })

  it('keeps a replaced product lock and exposes post-rename uncertainty rather than assuming rollback', async () => {
    const {repo} = await fixture(),
      entry = profile()
    vi.spyOn(repo, 'load').mockImplementationOnce(async () => {
      // Only this disposable product fixture is altered; no agent-runner or
      // foreign lock/process is inspected, reclaimed or modified.
      await unlink(`${repo.path}.lock`)
      await writeFile(`${repo.path}.lock`, 'synthetic-replacement', {
        flag: 'wx',
      })
      return {version: 1, revision: null, profiles: {}}
    })
    await expect(
      repo.saveIfRevision(null, {version: 1, profiles: {own: entry}}),
    ).rejects.toMatchObject({code: 'busy'})
    expect(await readFile(`${repo.path}.lock`, 'utf8')).toBe(
      'synthetic-replacement',
    )
    // A service must re-read exact publication before deleting/revoking a
    // fresh keyring reference after any uncertain save error.
    expect((await repo.load()).profiles.own).toEqual(entry)
  })

  it('uses a fresh separate keyring namespace and cannot query machine references', async () => {
    const values = new Map<string, string>(),
      calls: {service: string; account: string}[] = []
    const credentials = new SecureAccountDeviceCredentials(
      (service, account) => {
        calls.push({service, account})
        return {
          getPassword: () => values.get(account),
          setPassword: (value) => {
            values.set(account, value)
          },
          deletePassword: () => values.delete(account),
        }
      },
    )
    const first = accountDeviceCredentialAccount('own'),
      second = accountDeviceCredentialAccount('own')
    expect(first).not.toBe(second)
    await credentials.set(first, TOKEN)
    expect(await credentials.get(first)).toBe(TOKEN)
    await credentials.delete(first)
    expect(await credentials.get(first)).toBeUndefined()
    expect(
      calls.every(
        (call) =>
          call.service === 'com.polymorfa.cli.account-device-sessions' &&
          call.account === first,
      ),
    ).toBe(true)
    const count = calls.length
    await expect(credentials.get('profile:own:apiKey')).rejects.toMatchObject({
      code: 'invalid',
    })
    expect(calls).toHaveLength(count)
  })

  it('sanitizes keyring errors without recommending a machine-credential fallback', async () => {
    const credentials = new SecureAccountDeviceCredentials(() => {
      throw new Error(`synthetic failure ${TOKEN}`)
    })
    const account = accountDeviceCredentialAccount('own')
    for (const operation of [
      () => credentials.get(account),
      () => credentials.set(account, TOKEN),
      () => credentials.delete(account),
    ]) {
      await expect(operation()).rejects.toMatchObject({code: 'keyring'})
      await expect(operation()).rejects.not.toThrow(TOKEN)
      await expect(operation()).rejects.not.toThrow('POLYMORFA_API_KEY')
    }
  })
})
