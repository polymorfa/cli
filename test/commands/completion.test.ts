import {runCommand} from '@oclif/test'
import {AsyncEntry} from '@napi-rs/keyring'
import {afterEach, describe, expect, test, vi} from 'vitest'

describe('completion commands', () => {
  afterEach(() => vi.restoreAllMocks())

  test('prints scripts for each supported shell', async () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      const result = await runCommand(`completion ${shell}`)
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.stdout).toContain('polymorfa completion suggest')
    }
  })

  test('suggests local commands and fixed flags without auth or network calls', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const keyring = vi.spyOn(AsyncEntry.prototype, 'getPassword')
    const command = await runCommand('completion suggest --current=lo -- auth')
    expect(command.error, command.stderr).toBeUndefined()
    expect(command.stdout.split('\n')).toContain('login')
    const flags = await runCommand(
      'completion suggest --current=--j -- auth login',
    )
    expect(flags.error, flags.stderr).toBeUndefined()
    expect(flags.stdout.split('\n')).toContain('--json')
    expect(fetch).not.toHaveBeenCalled()
    expect(keyring).not.toHaveBeenCalled()
  })
})
