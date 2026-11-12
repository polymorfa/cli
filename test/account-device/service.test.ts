import {describe, expect, it} from 'vitest'

import {AccountDeviceLoginError} from '../../src/account-device/service.js'
import {CONFIG, serviceFixture} from './service-fixture.js'

async function login(
  f: Awaited<ReturnType<typeof serviceFixture>>,
  name = 'own',
) {
  const handle = await f.service.startLogin(name, CONFIG)
  f.tick(f.service.pollDelay(handle))
  const result = await f.service.pollLogin(handle)
  expect(result.kind).toBe('signedIn')
  return result
}

describe('account-device login/refresh/logout lifecycle', () => {
  it('stores the opaque session only in its separate keyring and reports truthful identity', async () => {
    const f = await serviceFixture(),
      result = await login(f)
    expect(result).toMatchObject({
      profile: 'own',
      remoteIdentityValidated: true,
      localCleanupConfirmed: true,
    })
    expect(f.credentials.values.size).toBe(1)
    const token = [...f.credentials.values.values()][0]!
    expect(JSON.stringify(f.profiles.current)).not.toContain(token)
    expect(JSON.stringify(result)).not.toContain(token)
    expect(await f.service.status()).toMatchObject({
      kind: 'accountDevice',
      credentialPresent: true,
      remoteIdentityValidated: true,
    })
    await expect(f.service.startLogin('own', CONFIG)).rejects.toMatchObject({
      code: 'refused',
    })
  })

  it('enforces pending/slow-down spacing and the original deadline without a cloned-handle authority', async () => {
    const f = await serviceFixture(),
      handle = await f.service.startLogin('own', CONFIG)
    const before = f.calls.length
    await expect(f.service.pollLogin(handle)).rejects.toMatchObject({
      code: 'refused',
    })
    expect(f.calls).toHaveLength(before)
    await expect(f.service.pollLogin({...handle})).rejects.toMatchObject({
      code: 'login_required',
    })
    f.polling.push('pending', 'slowDown')
    f.tick(f.service.pollDelay(handle))
    expect(await f.service.pollLogin(handle)).toEqual({
      kind: 'pending',
      waitMilliseconds: 1000,
    })
    f.tick(1000)
    expect(await f.service.pollLogin(handle)).toEqual({
      kind: 'pending',
      waitMilliseconds: 6000,
    })
    f.tick(300_000)
    await expect(f.service.pollLogin(handle)).rejects.toMatchObject({
      code: 'login_required',
    })
    expect(f.credentials.values.size).toBe(0)
  })

  it('refuses a concurrent poll without abandoning or duplicating the original redemption', async () => {
    const f = await serviceFixture(),
      handle = await f.service.startLogin('own', CONFIG),
      barrier = f.pausePoll()
    f.tick(f.service.pollDelay(handle))
    const first = f.service.pollLogin(handle)
    await barrier.started
    await expect(f.service.pollLogin(handle)).rejects.toMatchObject({
      code: 'refused',
    })
    barrier.release()
    expect(await first).toMatchObject({kind: 'signedIn'})
    expect(
      f.calls.filter((call) => call.path === '/api/auth/device/token'),
    ).toHaveLength(1)
  })

  it('cleans up a known late redeemed session after cancellation without saving a credential', async () => {
    const f = await serviceFixture(),
      handle = await f.service.startLogin('own', CONFIG),
      barrier = f.pausePoll()
    f.tick(f.service.pollDelay(handle))
    const result = f.service.pollLogin(handle)
    await barrier.started
    f.service.cancelLogin(handle)
    barrier.release()
    await expect(result).rejects.toMatchObject({
      recovery: {
        profileSaved: false,
        credentialPreserved: false,
        remoteRevocation: 'confirmed',
      },
    })
    expect(f.revoked).toHaveLength(1)
    expect(f.credentials.values.size).toBe(0)
    expect(Object.keys(f.profiles.current.profiles)).toHaveLength(0)
  })

  it('rolls back only the fresh unreferenced credential and revokes only its new session on a refused save', async () => {
    const f = await serviceFixture()
    f.profiles.failSave = 'before'
    await expect(login(f)).rejects.toBeInstanceOf(AccountDeviceLoginError)
    expect(f.credentials.values.size).toBe(0)
    expect(f.revoked).toHaveLength(1)
    expect(Object.keys(f.profiles.current.profiles)).toHaveLength(0)
  })

  it('retains a credential/session when exact readback proves metadata was published before an error', async () => {
    const f = await serviceFixture()
    f.profiles.failSave = 'after'
    expect(await login(f)).toMatchObject({
      kind: 'signedIn',
      localCleanupConfirmed: false,
    })
    expect(f.credentials.values.size).toBe(1)
    expect(f.revoked).toHaveLength(0)
    expect(await f.service.status()).toMatchObject({
      remoteIdentityValidated: true,
    })
  })

  it('preserves the sole credential and does not infer rollback when publication cannot be read back', async () => {
    const f = await serviceFixture()
    f.profiles.failSave = 'unreadable'
    await expect(login(f)).rejects.toMatchObject({
      recovery: {
        profileSaved: 'unknown',
        credentialPreserved: true,
        remoteRevocation: 'not_exercised',
      },
    })
    expect(f.credentials.values.size).toBe(1)
    expect(f.revoked).toHaveLength(0)
    expect(await f.service.status()).toMatchObject({
      remoteIdentityValidated: true,
    })
  })

  it('coalesces actual JWT refreshes per profile and never rotates the opaque keyring token', async () => {
    const f = await serviceFixture()
    await login(f)
    const before = [...f.credentials.values.entries()]
    // A separate command/service instance starts with an empty in-memory JWT.
    await f.service.use('own')
    const tokenCalls = f.calls.filter(
      (call) => call.path === '/api/auth/token',
    ).length
    const results = await Promise.all([
      f.service.teams('own'),
      f.service.teams('own'),
    ])
    expect(results).toEqual([
      {teams: [], nextAfter: null},
      {teams: [], nextAfter: null},
    ])
    expect(
      f.calls.filter((call) => call.path === '/api/auth/token'),
    ).toHaveLength(tokenCalls + 1)
    expect([...f.credentials.values.entries()]).toEqual(before)
  })

  it('refuses a late refresh after logout without restoring a cache or issuing a resource request', async () => {
    const f = await serviceFixture()
    await login(f)
    await f.service.use('own')
    const barrier = f.pauseRefresh(),
      request = f.service.teams('own')
    await barrier.started
    const logout = await f.service.logout('own')
    expect(logout).toMatchObject({
      remoteRevocation: 'confirmed',
      localMetadataRemoved: true,
      localCredentialRemoved: true,
    })
    barrier.release()
    await expect(request).rejects.toMatchObject({code: 'changed'})
    expect(
      f.calls.filter((call) => call.path === '/api/account/device/teams'),
    ).toHaveLength(0)
    await expect(f.service.status('own')).rejects.toMatchObject({
      code: 'login_required',
    })
  })

  it('revokes/removes exactly one profile while preserving another device and its local selection', async () => {
    const f = await serviceFixture()
    await login(f, 'one')
    await login(f, 'two')
    const second = f.profiles.current.profiles.two!
    const secondToken = f.credentials.values.get(second.credentialAccount)
    const result = await f.service.logout('one')
    expect(result).toMatchObject({
      remoteRevocation: 'confirmed',
      localMetadataRemoved: true,
      localCredentialRemoved: true,
    })
    expect(f.profiles.current.activeProfile).toBe('two')
    expect(f.profiles.current.profiles.two).toEqual(second)
    expect(f.credentials.values.get(second.credentialAccount)).toBe(secondToken)
    expect(
      [...f.sessions.values()].some(
        (session) => session.id === second.sessionId,
      ),
    ).toBe(true)
    expect(await f.service.status('two')).toMatchObject({
      remoteIdentityValidated: true,
    })
  })

  it('reports remote revocation separately from a failed local keyring deletion', async () => {
    const f = await serviceFixture()
    await login(f)
    f.credentials.failDelete = true
    expect(await f.service.logout()).toMatchObject({
      remoteRevocation: 'confirmed',
      localMetadataRemoved: true,
      localCredentialRemoved: false,
    })
    expect(f.credentials.values.size).toBe(1)
  })

  it('does not save or activate an older login over a newer metadata change', async () => {
    const f = await serviceFixture(),
      handle = await f.service.startLogin('own', CONFIG)
    const empty = await f.profiles.load()
    await f.profiles.saveIfRevision(empty.revision, {version: 1, profiles: {}})
    const changed = f.profiles.current.revision
    f.tick(f.service.pollDelay(handle))
    await expect(f.service.pollLogin(handle)).rejects.toBeInstanceOf(
      AccountDeviceLoginError,
    )
    expect(f.profiles.current.revision).toBe(changed)
    expect(f.credentials.values.size).toBe(0)
    expect(f.revoked).toHaveLength(1)
  })
})
