import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {spawn} from 'node:child_process'
import {afterEach, expect, test, vi} from 'vitest'
import {runProcess} from '../../src/services/agent-setup.js'

vi.mock('node:child_process', () => ({spawn: vi.fn()}))
afterEach(() => vi.restoreAllMocks())

test.each(['win32', 'linux', 'darwin'])(
  'launches clients with the appropriate shell on %s',
  async (platform) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(
      platform as NodeJS.Platform,
    )
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      kill: vi.fn(),
    })
    vi.mocked(spawn).mockReturnValue(
      child as unknown as ReturnType<typeof spawn>,
    )
    const result = runProcess('claude', ['plugin', 'list', '--json'])
    child.stdout.write('[]')
    child.emit('close', 0)
    await expect(result).resolves.toEqual({code: 0, stdout: '[]'})
    expect(spawn).toHaveBeenLastCalledWith(
      'claude',
      ['plugin', 'list', '--json'],
      {
        shell: platform === 'win32',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 120_000,
      },
    )
  },
)
