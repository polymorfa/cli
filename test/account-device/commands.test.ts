import {captureOutput} from '@oclif/test'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {AccountDeviceAuthService} from '../../src/account-device/service.js'
import AccountLogin from '../../src/commands/account/login.js'
import AccountList from '../../src/commands/account/list.js'
import AccountUse from '../../src/commands/account/use.js'
import AccountStatus from '../../src/commands/account/status.js'
import AccountLogout from '../../src/commands/account/logout.js'
import AccountTeams from '../../src/commands/account/teams.js'
import AccountProjects from '../../src/commands/account/projects.js'
import {CONFIG, serviceFixture} from './service-fixture.js'

const context = vi.hoisted(() => ({
  service: undefined as AccountDeviceAuthService | undefined,
  tick: (milliseconds: number) => {
    void milliseconds
  },
}))
vi.mock('../../src/account-device/factory.js', () => ({
  createAccountDeviceAuthService: () => {
    if (!context.service) throw new Error('fixture not installed')
    return context.service
  },
}))
vi.mock('../../src/account-device/command.js', async (original) => ({
  ...(await original<typeof import('../../src/account-device/command.js')>()),
  waitForAccountDevicePoll: (milliseconds: number, signal: AbortSignal) => {
    signal.throwIfAborted()
    context.tick(milliseconds)
    return Promise.resolve()
  },
}))

const ROOT = new URL('../../', import.meta.url).pathname
function signIn() {
  return captureOutput(() =>
    AccountLogin.run(
      [
        '--profile',
        'own',
        '--api-origin',
        CONFIG.issuer,
        '--console-origin',
        CONFIG.consoleOrigin,
        '--json',
      ],
      ROOT,
    ),
  )
}

describe('mounted account-device commands', () => {
  let fixture: Awaited<ReturnType<typeof serviceFixture>>
  beforeEach(async () => {
    fixture = await serviceFixture()
    context.service = fixture.service
    context.tick = fixture.tick
  })

  it('mounts login through the actual signed exchange without printing private credentials', async () => {
    const result = await signIn()
    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      profile: 'own',
      kind: 'signedIn',
      remoteIdentityValidated: true,
    })
    expect(JSON.parse(result.stderr)).toEqual({
      verificationUri: `${CONFIG.consoleOrigin}/device`,
      userCode: 'CODE-1',
    })
    for (const token of fixture.credentials.values.values()) {
      expect(result.stdout).not.toContain(token)
      expect(result.stderr).not.toContain(token)
    }
    expect(result.stdout + result.stderr).not.toContain('synthetic-device-')
    const call = fixture.calls.find(
      (entry) => entry.path === '/api/auth/device/code',
    )!
    expect(call.body).toEqual({client_id: 'polymorfa-cli'})
    expect(call.headers.has('authorization')).toBe(false)
  })

  it('lists/selects only account profiles and checks actual remote session identity', async () => {
    expect((await signIn()).error).toBeUndefined()
    const before = fixture.calls.length
    const list = await captureOutput(() => AccountList.run(['--json'], ROOT))
    expect(JSON.parse(list.stdout)).toEqual([
      expect.objectContaining({
        name: 'own',
        kind: 'accountDevice',
        active: true,
      }),
    ])
    const use = await captureOutput(() =>
      AccountUse.run(['own', '--json'], ROOT),
    )
    expect(JSON.parse(use.stdout)).toEqual({
      profile: 'own',
      active: true,
      kind: 'accountDevice',
    })
    expect(fixture.calls).toHaveLength(before)
    const status = await captureOutput(() =>
      AccountStatus.run(['--profile', 'own', '--json'], ROOT),
    )
    expect(status.error, status.stderr).toBeUndefined()
    expect(JSON.parse(status.stdout)).toMatchObject({
      profile: 'own',
      credentialPresent: true,
      remoteIdentityValidated: true,
    })
    expect(fixture.calls.at(-1)?.path).toBe('/api/auth/get-session')
  })

  it('mounts only the two account resource reads with typed pagination', async () => {
    expect((await signIn()).error).toBeUndefined()
    const teams = await captureOutput(() =>
      AccountTeams.run(['--limit', '2', '--json'], ROOT),
    )
    expect(teams.error, teams.stderr).toBeUndefined()
    expect(JSON.parse(teams.stdout)).toEqual({teams: [], nextAfter: null})
    const projects = await captureOutput(() =>
      AccountProjects.run(
        [
          '--team',
          '11111111-1111-4111-8111-111111111111',
          '--limit',
          '1',
          '--json',
        ],
        ROOT,
      ),
    )
    expect(projects.error, projects.stderr).toBeUndefined()
    expect(JSON.parse(projects.stdout)).toEqual({projects: [], nextAfter: null})
    expect(
      fixture.calls
        .filter((entry) => entry.path.startsWith('/api/account/device/'))
        .map((entry) => entry.path),
    ).toEqual(['/api/account/device/teams', '/api/account/device/projects'])
  })

  it('revokes only its own session and reports local cleanup separately', async () => {
    expect((await signIn()).error).toBeUndefined()
    const result = await captureOutput(() =>
      AccountLogout.run(['--profile', 'own', '--json'], ROOT),
    )
    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      profile: 'own',
      remoteRevocation: 'confirmed',
      localMetadataRemoved: true,
      localCredentialRemoved: true,
    })
    expect(fixture.revoked).toHaveLength(1)
    expect(fixture.credentials.values.size).toBe(0)
  })

  it('exits nonzero for incomplete cleanup without calling it a remote failure', async () => {
    expect((await signIn()).error).toBeUndefined()
    fixture.credentials.failDelete = true
    const result = await captureOutput(() =>
      AccountLogout.run(['--json'], ROOT),
    )
    expect(result.error).toBeDefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      remoteRevocation: 'confirmed',
      localMetadataRemoved: true,
      localCredentialRemoved: false,
    })
  })

  it.each([
    ['raw-route override', ['--path', '/api/keys']],
    ['machine owner override', ['--owner', 'organization']],
    [
      'issuer override after login',
      ['--api-origin', 'https://other.example.invalid'],
    ],
    ['oversized page', ['--limit', '101']],
  ])(
    'refuses %s before any credential or network call',
    async (_name, flags) => {
      const result = await captureOutput(() =>
        AccountTeams.run([...flags, '--json'], ROOT),
      )
      expect(result.error).toBeDefined()
      expect(fixture.calls).toHaveLength(0)
      expect(fixture.credentials.values.size).toBe(0)
    },
  )

  it('requires a project team selector before any credential or network call', async () => {
    const result = await captureOutput(() =>
      AccountProjects.run(['--json'], ROOT),
    )
    expect(result.error).toBeDefined()
    expect(fixture.calls).toHaveLength(0)
  })

  it('does not echo an arbitrary storage failure or fall back to machine credentials', async () => {
    expect((await signIn()).error).toBeUndefined()
    vi.spyOn(fixture.credentials, 'get').mockRejectedValueOnce(
      new Error('synthetic-private-token-must-not-print'),
    )
    const result = await captureOutput(() =>
      AccountStatus.run(['--json'], ROOT),
    )
    expect(result.error).toBeDefined()
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'account_device_failed',
        message: 'The account-device operation could not be completed.',
      },
    })
    expect(result.stderr + result.stdout).not.toContain(
      'synthetic-private-token-must-not-print',
    )
  })
})
