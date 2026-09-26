import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
  initStarter,
  STARTER_SDK_VERSION,
} from '../../src/services/init-starter.js'
import {withEnvironment} from '../helpers/http-server.js'

describe('init starter', () => {
  let directory: string
  let original: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-init-'))
    original = process.cwd()
    process.chdir(directory)
  })

  afterEach(async () => {
    process.chdir(original)
    await rm(directory, {force: true, recursive: true})
  })

  test('creates four credential-free files with an exact published SDK version', async () => {
    const marker = 'pmfa_marker_must_not_appear_in_starter'
    const result = await withEnvironment({POLYMORFA_API_KEY: marker}, () =>
      runCommand('init'),
    )
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.stdout).toContain(
      'Created package.json, .env.example, README.md, src/index.ts',
    )

    const manifest: unknown = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8'),
    )
    expect(manifest).toMatchObject({
      dependencies: {'@polymorfa/sdk': STARTER_SDK_VERSION},
      private: true,
    })
    expect((await readdir(directory)).sort()).toEqual([
      '.env.example',
      'README.md',
      'package.json',
      'src',
    ])
    expect(await readdir(join(directory, 'src'))).toEqual(['index.ts'])
    const contents = await Promise.all([
      readFile(join(directory, 'package.json'), 'utf8'),
      readFile(join(directory, '.env.example'), 'utf8'),
      readFile(join(directory, 'README.md'), 'utf8'),
      readFile(join(directory, 'src/index.ts'), 'utf8'),
    ])
    expect(contents.join('\n')).not.toContain(marker)
    expect(contents[1]).toBe('POLYMORFA_API_KEY=\n')
    expect(contents[3]).toContain('client.projects.list()')
    await expect(
      lstat(join(directory, 'polymorfa.json')),
    ).rejects.toMatchObject({code: 'ENOENT'})
  })

  test.each(['package.json', '.env.example', 'README.md', 'src'])(
    'refuses a partial target containing %s without changing it',
    async (existing) => {
      const target = join(directory, existing)
      if (existing === 'src') await mkdir(target)
      else await writeFile(target, 'preserve me')
      await expect(initStarter(directory)).rejects.toThrow('already exists')
      expect(await readdir(directory)).toEqual([existing])
      if (existing !== 'src')
        expect(await readFile(target, 'utf8')).toBe('preserve me')
    },
  )

  test('refuses a second run without replacing the first output', async () => {
    await initStarter(directory)
    const before = await readFile(join(directory, 'package.json'), 'utf8')
    await expect(initStarter(directory)).rejects.toThrow('already exists')
    expect(await readFile(join(directory, 'package.json'), 'utf8')).toBe(before)
  })
})
