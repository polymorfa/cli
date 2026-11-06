import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test, vi} from 'vitest'

const index = [
  '- [Quickstart](https://docs.polymorfa.com/quickstart.md): Connect a number.',
  '- [Rate limits](https://docs.polymorfa.com/api/rate-limits.md): Request limits.',
].join('\n')

describe('docs commands', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('searches the published index with no credential lookup', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(index)))
    vi.stubGlobal('fetch', fetcher)
    const result = await runCommand('docs search limits --json')
    expect(result.error, result.stderr).toBeUndefined()
    const parsed: unknown = JSON.parse(result.stdout)
    expect(parsed).toEqual([
      {
        title: 'Rate limits',
        path: 'api/rate-limits',
        description: 'Request limits.',
        url: 'https://docs.polymorfa.com/api/rate-limits',
      },
    ])
    expect(fetcher).toHaveBeenCalledOnce()
  })

  test('prints one exact published URL without launching a browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(index))),
    )
    const result = await runCommand('docs open api/rate-limits --print')
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.stdout.trim()).toBe(
      'https://docs.polymorfa.com/api/rate-limits',
    )
  })
})
