import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'

import {resolveConfigDirectory} from '../../src/config/paths.js'
import {ProfileRepository} from '../../src/config/profiles.js'

describe('resolveConfigDirectory', () => {
  test('honors the explicit Polymorfa directory', () => {
    expect(
      resolveConfigDirectory({
        env: {POLYMORFA_CONFIG_DIR: '/custom/polymorfa'},
        home: '/home/me',
        platform: 'linux',
      }),
    ).toBe('/custom/polymorfa')
  })

  test.each([
    ['darwin', {}, '/Users/me/Library/Application Support/polymorfa'],
    ['linux', {XDG_CONFIG_HOME: '/xdg'}, '/xdg/polymorfa'],
    ['linux', {}, '/home/me/.config/polymorfa'],
    [
      'win32',
      {APPDATA: 'C:\\Users\\me\\AppData'},
      'C:\\Users\\me\\AppData/polymorfa',
    ],
  ] as const)('resolves %s config paths', (platform, env, expected) => {
    expect(
      resolveConfigDirectory({
        env,
        home: platform === 'darwin' ? '/Users/me' : '/home/me',
        platform,
      }),
    ).toBe(expected)
  })
})

describe('ProfileRepository', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((path) => rm(path, {force: true, recursive: true})),
    )
  })

  test('returns an empty versioned config when the file is missing', async () => {
    const directory = await temporaryDirectory()
    const repository = new ProfileRepository(join(directory, 'config.json'))

    await expect(repository.load()).resolves.toEqual({profiles: {}, version: 2})
  })

  test('writes non-secret profile metadata atomically with restricted permissions', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'nested', 'config.json')
    const repository = new ProfileRepository(path)

    await repository.save({
      activeProfile: 'work',
      profiles: {
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
          organization: 'org_123',
        },
      },
      version: 2,
    })

    const serialized = await readFile(path, 'utf8')
    expect(JSON.parse(serialized)).toEqual({
      activeProfile: 'work',
      profiles: {
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
          organization: 'org_123',
        },
      },
      version: 2,
    })
    expect(serialized).not.toContain('pmfa_')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await stat(join(directory, 'nested'))).mode & 0o777).toBe(0o700)
  })

  test('migrates version 1 metadata without inventing an owner', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'config.json')
    const repository = new ProfileRepository(path)
    await writeFile(
      path,
      JSON.stringify({
        activeProfile: 'work',
        profiles: {
          work: {
            credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
            project: 'project_1',
          },
        },
        version: 1,
      }),
      'utf8',
    )

    await expect(repository.load()).resolves.toEqual({
      activeProfile: 'work',
      profiles: {
        work: {
          credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
          project: 'project_1',
        },
      },
      version: 2,
    })
  })

  test('requires project-token profiles to declare exact project ownership', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'config.json')
    const repository = new ProfileRepository(path)
    await writeFile(
      path,
      JSON.stringify({
        profiles: {
          project: {
            credential: {
              account: 'profile:project:projectToken',
              kind: 'projectToken',
            },
            owner: 'organization',
            project: 'project_1',
          },
        },
        version: 2,
      }),
      'utf8',
    )

    await expect(repository.load()).rejects.toThrow('invalid shape')
  })

  test('rejects unsupported or malformed configuration', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'config.json')
    const repository = new ProfileRepository(path)
    await writeFile(path, '{"version":3,"profiles":{}}', 'utf8')

    await expect(repository.load()).rejects.toThrow(
      'Unsupported Polymorfa config version 3.',
    )
  })

  test('rejects unknown profile fields so credentials cannot drift into metadata', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'config.json')
    const repository = new ProfileRepository(path)
    await writeFile(
      path,
      JSON.stringify({
        profiles: {
          work: {
            apiKey: 'pmfa_must-not-be-accepted',
            credential: {account: 'profile:work:apiKey', kind: 'apiKey'},
          },
        },
        version: 2,
      }),
      'utf8',
    )

    await expect(repository.load()).rejects.toThrow('has an invalid shape')
  })

  async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-profiles-'))
    directories.push(directory)
    return directory
  }
})
