import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

describe('version', () => {
  test('prints the CLI and SDK development versions', async () => {
    const result = await runCommand('version')

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('polymorfa/0.1.0-dev.0 sdk/0.1.0-dev.0\n')
    expect(result.stderr).toBe('')
  })
})
