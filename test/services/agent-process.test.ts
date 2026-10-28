import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {spawn} from 'node:child_process'
import {afterEach, expect, test, vi} from 'vitest'
import {AGENT_KIT, runProcess} from '../../src/services/agent-setup.js'

vi.mock('node:child_process', () => ({spawn: vi.fn()}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function childFixture() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    kill: vi.fn(),
  })
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>)
  return child
}

test.each(['win32', 'linux', 'darwin'])(
  'launches clients with the appropriate shell on %s',
  async (platform) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(
      platform as NodeJS.Platform,
    )
    const child = childFixture()
    const result = runProcess('claude', ['plugin', 'list', '--json'])
    child.stdout.write('[]')
    child.emit('close', 0)
    await expect(result).resolves.toEqual({code: 0, stdout: '[]'})
    const options = {
      shell: platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 120_000,
    }
    if (platform === 'win32')
      expect(spawn).toHaveBeenLastCalledWith(
        'claude plugin list --json',
        options,
      )
    else
      expect(spawn).toHaveBeenLastCalledWith(
        'claude',
        ['plugin', 'list', '--json'],
        options,
      )
  },
)

test('keeps the fixed Git installer URL intact in the Windows command', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const child = childFixture()
  const result = runProcess('gemini', [
    'extensions',
    'install',
    AGENT_KIT.repository,
    '--consent',
  ])
  child.emit('close', 0)
  await expect(result).resolves.toEqual({code: 0, stdout: ''})
  expect(spawn).toHaveBeenCalledWith(
    'gemini extensions install https://github.com/polymorfa/agent-kit --consent',
    {shell: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000},
  )
})

test.each([
  'a b',
  '&whoami',
  '%PATH%',
  'a|b',
  'a^b',
  'a>b',
  '"quoted"',
  'a\nb',
])(
  'rejects a Windows shell token outside the fixed installer grammar: %j',
  async (arg) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const child = childFixture()
    const result = runProcess('claude', ['plugin', arg])
    child.emit('close', 0)
    await expect(result).resolves.toEqual({code: 1, stdout: ''})
    expect(spawn).not.toHaveBeenCalled()
  },
)

test('rejects shell syntax in the Windows executable name', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const child = childFixture()
  const result = runProcess('claude&whoami', ['--help'])
  child.emit('close', 0)
  await expect(result).resolves.toEqual({code: 1, stdout: ''})
  expect(spawn).not.toHaveBeenCalled()
})

test('keeps POSIX arguments literal without a shell', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  const child = childFixture()
  const args = ['value with spaces', 'a;whoami', '%PATH%']
  const result = runProcess('claude', args)
  child.emit('close', 0)
  await expect(result).resolves.toEqual({code: 0, stdout: ''})
  expect(spawn).toHaveBeenCalledWith('claude', args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 120_000,
  })
})

test('retains the output bound and kills a child exceeding it', async () => {
  const child = childFixture()
  const result = runProcess('claude', ['plugin', 'list', '--json'])
  const allowed = 'a'.repeat(1024 * 1024)
  child.stdout.write(allowed)
  child.stdout.write('overflow')
  expect(child.kill).toHaveBeenCalledOnce()
  child.emit('close', 0)
  await expect(result).resolves.toEqual({code: 0, stdout: allowed})
})
