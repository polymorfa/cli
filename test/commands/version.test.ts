import {readFileSync} from 'node:fs'
import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  dependencies: {'@polymorfa/sdk': string}
}
const pinnedSdkVersion = manifest.dependencies['@polymorfa/sdk']

describe('version', () => {
  test('prints the CLI and SDK development versions', async () => {
    const result = await runCommand('version')

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(
      `polymorfa/0.1.0-dev.0 sdk/${pinnedSdkVersion}\n`,
    )
    expect(result.stderr).toBe('')
  })

  test('prints one JSON document without terminal commentary', async () => {
    const result = await runCommand('version --json')

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      cli: '0.1.0-dev.0',
      sdk: pinnedSdkVersion,
    })
    expect(result.stderr).toBe('')
  })

  test('prints nothing in quiet mode', async () => {
    const result = await runCommand('version --quiet')

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })

  test('reports conflicting output flags as a validation error', async () => {
    const result = await runCommand('version --json --quiet')

    expect(exitCode(result.error)).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {category: 'validation', code: 'validation_error'},
      schemaVersion: 1,
    })
    expect(result.stdout).toBe('')
  })
})

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error)) {
    return undefined
  }

  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
