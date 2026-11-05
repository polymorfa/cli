import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {spawn} from 'node:child_process'
import {afterEach, expect, test, vi} from 'vitest'
import {runProcess} from '../../src/services/agent-setup.js'
vi.mock('node:child_process', () => ({spawn: vi.fn()}))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
function child(pid = 1234) {
  return Object.assign(new EventEmitter(), {
    pid,
    stdout: new PassThrough(),
    kill: vi.fn(),
    unref: vi.fn(),
  })
}
test('fails at the 120-second deadline after tree cleanup even when stdout never closes', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const primary = child()
  const cleanup = child(5678)
  vi.mocked(spawn)
    .mockReturnValueOnce(primary as unknown as ReturnType<typeof spawn>)
    .mockReturnValueOnce(cleanup as unknown as ReturnType<typeof spawn>)
  let result: unknown
  const pending = runProcess('claude', ['plugin', 'list', '--json']).then(
    (value) => {
      result = value
      return value
    },
  )
  await vi.advanceTimersByTimeAsync(119_999)
  expect(result).toBeUndefined()
  expect(spawn).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(spawn).toHaveBeenLastCalledWith(
    'taskkill.exe',
    ['/pid', '1234', '/t', '/f'],
    {shell: false, stdio: 'ignore', windowsHide: true},
  )
  expect(result).toBeUndefined()
  cleanup.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  expect(primary.stdout.destroyed).toBe(true)
  expect(primary.unref).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

test('overflow fails after tree cleanup even if the shell reports a successful close', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const primary = child()
  const cleanup = child(5678)
  vi.mocked(spawn)
    .mockReturnValueOnce(primary as unknown as ReturnType<typeof spawn>)
    .mockReturnValueOnce(cleanup as unknown as ReturnType<typeof spawn>)
  let result: unknown
  const pending = runProcess('claude', ['plugin', 'list']).then((value) => {
    result = value
    return value
  })
  primary.stdout.write('a'.repeat(1024 * 1024))
  expect(spawn).toHaveBeenCalledTimes(1)
  primary.stdout.write('overflow')
  primary.stdout.write('ignored extra output')
  primary.emit('exit', 0)
  primary.emit('close', 0)
  await Promise.resolve()
  expect(result).toBeUndefined()
  expect(spawn).toHaveBeenCalledTimes(2)
  cleanup.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  expect(primary.stdout.destroyed).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
test('reads complete stdout after exit and reports success only after close', async () => {
  vi.useFakeTimers()
  const primary = child()
  vi.mocked(spawn).mockReturnValue(
    primary as unknown as ReturnType<typeof spawn>,
  )
  let result: unknown
  const pending = runProcess('claude', ['plugin', 'list']).then((value) => {
    result = value
    return value
  })
  primary.stdout.write('{"installed":')
  primary.emit('exit', 0)
  await Promise.resolve()
  expect(result).toBeUndefined()
  primary.stdout.write('[]}')
  primary.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 0, stdout: '{"installed":[]}'})
  expect(vi.getTimerCount()).toBe(0)
})
test('fails when a descendant holds stdout after the parent exits, without targeting a dead PID', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const primary = child()
  vi.mocked(spawn).mockReturnValue(
    primary as unknown as ReturnType<typeof spawn>,
  )
  const pending = runProcess('claude', ['plugin', 'list'])
  primary.emit('exit', 0)
  await vi.advanceTimersByTimeAsync(120_000)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  expect(spawn).toHaveBeenCalledTimes(1)
  expect(primary.kill).not.toHaveBeenCalled()
  expect(primary.stdout.destroyed).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
test.each(['error', 'nonzero', 'throw'] as const)(
  'cleanup %s still settles as failure without close',
  async (failure) => {
    vi.useFakeTimers()
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const primary = child()
    const cleanup = child(5678)
    const mocked = vi
      .mocked(spawn)
      .mockReturnValueOnce(primary as unknown as ReturnType<typeof spawn>)
    if (failure === 'throw')
      mocked.mockImplementationOnce(() => {
        throw new Error('private cleanup detail')
      })
    else
      mocked.mockReturnValueOnce(cleanup as unknown as ReturnType<typeof spawn>)
    const pending = runProcess('claude', ['plugin', 'list'])
    await vi.advanceTimersByTimeAsync(120_000)
    if (failure === 'error')
      cleanup.emit('error', new Error('private cleanup detail'))
    if (failure === 'nonzero') cleanup.emit('close', 1)
    await expect(pending).resolves.toEqual({code: 1, stdout: ''})
    expect(primary.kill).toHaveBeenCalledOnce()
    expect(primary.unref).toHaveBeenCalledOnce()
    expect(primary.stdout.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  },
)
test('bounds a hung cleanup command to five seconds', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const primary = child()
  const cleanup = child(5678)
  vi.mocked(spawn)
    .mockReturnValueOnce(primary as unknown as ReturnType<typeof spawn>)
    .mockReturnValueOnce(cleanup as unknown as ReturnType<typeof spawn>)
  let result: unknown
  const pending = runProcess('claude', ['plugin', 'list']).then((value) => {
    result = value
    return value
  })
  await vi.advanceTimersByTimeAsync(124_999)
  expect(result).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  expect(cleanup.kill).toHaveBeenCalledOnce()
  expect(cleanup.unref).toHaveBeenCalledOnce()
  expect(primary.kill).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
test('error/exit/close races cannot turn failure into success or kill a completed PID', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const primary = child()
  const cleanup = child(5678)
  vi.mocked(spawn)
    .mockReturnValueOnce(primary as unknown as ReturnType<typeof spawn>)
    .mockReturnValueOnce(cleanup as unknown as ReturnType<typeof spawn>)
  const pending = runProcess('claude', ['plugin', 'list'])
  primary.emit('error', new Error('private child detail'))
  primary.emit('exit', 0)
  primary.emit('close', 0)
  cleanup.emit('error', new Error('private cleanup detail'))
  cleanup.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  primary.emit('error', new Error('late private error'))
  expect(primary.kill).not.toHaveBeenCalled()
  expect(spawn).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})
test('a failed direct POSIX kill remains bounded and preserves literal arguments', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  const primary = child()
  primary.kill.mockImplementation(() => {
    throw new Error('kill failed')
  })
  vi.mocked(spawn).mockReturnValue(
    primary as unknown as ReturnType<typeof spawn>,
  )
  const pending = runProcess('claude', ['literal argument;still literal'])
  await vi.advanceTimersByTimeAsync(120_000)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  expect(spawn).toHaveBeenCalledWith(
    'claude',
    ['literal argument;still literal'],
    {shell: false, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000},
  )
  expect(primary.stdout.destroyed).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
test('accepts exactly the existing one MiB stdout limit', async () => {
  vi.useFakeTimers()
  const primary = child()
  vi.mocked(spawn).mockReturnValue(
    primary as unknown as ReturnType<typeof spawn>,
  )
  const pending = runProcess('claude', ['plugin', 'list'])
  const output = 'a'.repeat(1024 * 1024)
  primary.stdout.write(output)
  primary.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 0, stdout: output})
  expect(primary.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

test('enforces the one MiB limit in UTF-8 bytes, not UTF-16 character count', async () => {
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  const primary = child()
  vi.mocked(spawn).mockReturnValue(
    primary as unknown as ReturnType<typeof spawn>,
  )
  const pending = runProcess('claude', ['plugin', 'list'])
  primary.stdout.write('é'.repeat(512 * 1024))
  primary.stdout.write('é')
  primary.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 1, stdout: ''})
  expect(primary.kill).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
test('accepts exactly one MiB of UTF-8 text', async () => {
  vi.useFakeTimers()
  const primary = child()
  vi.mocked(spawn).mockReturnValue(
    primary as unknown as ReturnType<typeof spawn>,
  )
  const pending = runProcess('claude', ['plugin', 'list'])
  const output = 'é'.repeat(512 * 1024)
  primary.stdout.write(output)
  primary.emit('close', 0)
  await expect(pending).resolves.toEqual({code: 0, stdout: output})
  expect(primary.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
