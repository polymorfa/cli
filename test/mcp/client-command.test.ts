import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {afterEach, describe, expect, test, vi} from 'vitest'

const childProcess = vi.hoisted(() => ({spawn: vi.fn()}))

vi.mock('node:child_process', () => ({spawn: childProcess.spawn}))

import {
  mcpClientInvocation,
  runMcpClientCommand,
} from '../../src/mcp/client-command.js'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  childProcess.spawn.mockReset()
})

describe('mcpClientInvocation', () => {
  test('uses current Codex and Claude stdio MCP command shapes', () => {
    expect(mcpClientInvocation('codex', 'install')).toEqual({
      command: 'codex',
      args: ['mcp', 'add', 'polymorfa', '--', 'polymorfa', 'mcp', 'serve'],
    })
    expect(mcpClientInvocation('claude', 'install')).toEqual({
      command: 'claude',
      args: [
        'mcp',
        'add',
        '--transport',
        'stdio',
        '--scope',
        'user',
        'polymorfa',
        '--',
        'polymorfa',
        'mcp',
        'serve',
      ],
    })
    expect(mcpClientInvocation('codex', 'uninstall')).toEqual({
      command: 'codex',
      args: ['mcp', 'remove', 'polymorfa'],
    })
  })

  test('terminates a client command after the hard timeout', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    childProcess.spawn.mockReturnValue(child)

    const pending = runMcpClientCommand('codex', 'status')
    const rejected = expect(pending).rejects.toThrow(
      'codex status timed out after 30 seconds and was terminated',
    )
    await vi.advanceTimersByTimeAsync(30_000)

    await rejected
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')

    await vi.advanceTimersByTimeAsync(1000)
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL')
  })

  test('reports the signal when a client command is terminated', async () => {
    const child = fakeChild()
    childProcess.spawn.mockReturnValue(child)

    const pending = runMcpClientCommand('claude', 'install')
    child.stderr.write('client stopped unexpectedly')
    child.emit('close', null, 'SIGKILL')

    await expect(pending).rejects.toThrow(
      'claude install was terminated by signal SIGKILL. client stopped unexpectedly',
    )
  })
})

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>
    stderr: PassThrough
    stdout: PassThrough
  }
  child.kill = vi.fn(() => true)
  child.stderr = new PassThrough()
  child.stdout = new PassThrough()
  return child
}
