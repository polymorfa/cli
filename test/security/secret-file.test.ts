import {lstat, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

import {prepareSecretFile} from '../../src/security/secret-file.js'
import {temporaryDirectory} from '../support/fs.js'

const posixOnly = test.skipIf(process.platform === 'win32')

describe('prepareSecretFile', () => {
  posixOnly('writes once to a regular private file', async () => {
    const path = join(await temporaryDirectory(), 'secret')
    const destination = await prepareSecretFile(path)
    await destination.write('private-value')

    expect(await readFile(path, 'utf8')).toBe('private-value\n')
    expect((await lstat(path)).mode & 0o777).toBe(0o600)
  })

  test('refuses an existing destination before a remote mutation', async () => {
    const path = join(await temporaryDirectory(), 'secret')
    await writeFile(path, 'keep', {mode: 0o600})
    await expect(prepareSecretFile(path)).rejects.toThrow('already exists')
    expect(await readFile(path, 'utf8')).toBe('keep')
  })

  test('writes on Windows without requiring directory fsync support', async () => {
    const path = join(await temporaryDirectory(), 'secret')
    const platform = process.platform

    try {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: 'win32',
      })
      const destination = await prepareSecretFile(path)
      await destination.write('private-value')
      expect(await readFile(path, 'utf8')).toBe('private-value\n')
    } finally {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: platform,
      })
    }
  })
})
