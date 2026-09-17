import {runCommand} from '@oclif/test'
import {AsyncEntry} from '@napi-rs/keyring'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {withEnvironment} from '../helpers/http-server.js'

const secrets = new Map<string, string>()

describe('auth commands', () => {
  const directories: string[] = []

  beforeEach(() => {
    vi.spyOn(AsyncEntry.prototype, 'deletePassword').mockImplementation(() => {
      secrets.delete('profile:work:apiKey')
      return Promise.resolve(true)
    })
    vi.spyOn(AsyncEntry.prototype, 'getPassword').mockImplementation(() =>
      Promise.resolve(secrets.get('profile:work:apiKey')),
    )
    vi.spyOn(AsyncEntry.prototype, 'setPassword').mockImplementation(
      (value) => {
        secrets.set('profile:work:apiKey', value)
        return Promise.resolve()
      },
    )
  })

  afterEach(async () => {
    secrets.clear()
    vi.restoreAllMocks()
    await Promise.all(
      directories
        .splice(0)
        .map((path) => rm(path, {force: true, recursive: true})),
    )
  })

  test('login requires an explicit stdin credential flow until browser auth exists', async () => {
    await withConfig(async () => {
      const result = await runCommand('auth login --json')

      expect(exitCode(result.error)).toBe(2)
      const error = JSON.parse(result.stderr) as {
        error: {category: string; message: string}
      }
      expect(error.error.category).toBe('configuration')
      expect(error.error.message).toContain('--with-api-key')
    })
  })

  test('logs in from stdin, lists profiles, and switches active profile', async () => {
    await withConfig(async () => {
      const login = await withStdin(
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n',
        async () =>
          runCommand('auth login --with-api-key --profile work --json'),
      )
      expect(login.error, login.stderr).toBeUndefined()
      expect(JSON.parse(login.stdout)).toEqual({
        active: true,
        credentialKind: 'apiKey',
        name: 'work',
      })

      const list = await runCommand('auth list --json')
      expect(JSON.parse(list.stdout)).toEqual([
        {active: true, credentialKind: 'apiKey', name: 'work'},
      ])

      const use = await runCommand('auth use work --json')
      expect(JSON.parse(use.stdout)).toMatchObject({active: true, name: 'work'})
    })
  })

  test('reports keyring availability and logs out only the selected profile', async () => {
    await withConfig(async () => {
      await withStdin(
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n',
        async () =>
          runCommand('auth login --with-api-key --profile work --json'),
      )

      const status = await runCommand('auth status --profile work --json')
      expect(JSON.parse(status.stdout)).toMatchObject({
        credentialFormatValid: true,
        credentialPresent: true,
        name: 'work',
        remoteIdentityValidated: false,
        source: 'keyring',
      })

      const logout = await runCommand('auth logout --profile work --json')
      expect(JSON.parse(logout.stdout)).toEqual({name: 'work', removed: true})

      const list = await runCommand('auth list --json')
      expect(JSON.parse(list.stdout)).toEqual([])
    })
  })

  test('reports environment credential validation separately from remote exercise', async () => {
    await withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      async () => {
        const status = await runCommand('auth status --json')
        expect(status.error).toBeUndefined()
        expect(JSON.parse(status.stdout)).toEqual({
          credentialFormatValid: true,
          credentialKind: 'apiKey',
          credentialPresent: true,
          remoteIdentityValidated: false,
          source: 'environment',
        })
      },
    )
  })

  test('stores a project-token profile with exact project ownership', async () => {
    await withConfig(async () => {
      const token = `pmfa_pt_${'A'.repeat(94)}\n`
      const login = await withStdin(token, async () =>
        runCommand(
          'auth login --with-project-token --profile project --project project_1 --json',
        ),
      )

      expect(login.error, login.stderr).toBeUndefined()
      expect(JSON.parse(login.stdout)).toEqual({
        active: true,
        credentialKind: 'projectToken',
        name: 'project',
        owner: 'project',
        project: 'project_1',
      })
    })
  })

  test('validates project-token context before reading standard input', async () => {
    await withConfig(async () => {
      const login = await withStdin('', async () =>
        runCommand('auth login --with-project-token --profile project --json'),
      )

      expect(exitCode(login.error)).toBe(2)
      expect(
        (JSON.parse(login.stderr) as {error: {message: string}}).error.message,
      ).toContain('requires --project')
    })
  })

  test('reports an environment project token without exposing it', async () => {
    const token = `pmfa_pt_${'A'.repeat(94)}`
    await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: token,
      },
      () =>
        withConfig(async () => {
          const status = await runCommand('auth status --json')
          expect(status.error, status.stderr).toBeUndefined()
          expect(JSON.parse(status.stdout)).toEqual({
            credentialFormatValid: true,
            credentialKind: 'projectToken',
            credentialPresent: true,
            remoteIdentityValidated: false,
            source: 'environment',
          })
          expect(status.stdout).not.toContain(token)
        }),
    )
  })

  async function withConfig(run: () => Promise<void>): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-auth-command-'))
    directories.push(directory)
    await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_CONFIG_DIR: directory,
      },
      run,
    )
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}

async function withStdin<T>(value: string, run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: Readable.from([value]),
  })
  try {
    return await run()
  } finally {
    if (descriptor !== undefined)
      Object.defineProperty(process, 'stdin', descriptor)
  }
}
