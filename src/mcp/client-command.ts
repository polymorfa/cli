import {spawn} from 'node:child_process'

export type McpClient = 'codex' | 'claude'
export type McpClientAction = 'install' | 'uninstall' | 'status'

const COMMAND_TIMEOUT_MS = 30_000
const FORCE_KILL_DELAY_MS = 1000

export function mcpClientInvocation(
  client: McpClient,
  action: McpClientAction,
): {command: string; args: string[]} {
  if (client === 'codex') {
    if (action === 'install') {
      return {
        command: 'codex',
        args: ['mcp', 'add', 'polymorfa', '--', 'polymorfa', 'mcp', 'serve'],
      }
    }
    if (action === 'uninstall')
      return {command: 'codex', args: ['mcp', 'remove', 'polymorfa']}
    return {command: 'codex', args: ['mcp', 'get', 'polymorfa']}
  }
  if (action === 'install') {
    return {
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
    }
  }
  if (action === 'uninstall')
    return {
      command: 'claude',
      args: ['mcp', 'remove', '--scope', 'user', 'polymorfa'],
    }
  return {command: 'claude', args: ['mcp', 'get', 'polymorfa']}
}

export function runMcpClientCommand(
  client: McpClient,
  action: McpClientAction,
): Promise<{client: McpClient; action: McpClientAction; output: string}> {
  const invocation = mcpClientInvocation(client, action)
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let closed = false
    let settled = false
    let forceKillTimer: NodeJS.Timeout | undefined
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      callback()
    }
    const timeoutTimer = setTimeout(() => {
      if (closed) return
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (!closed) child.kill('SIGKILL')
      }, FORCE_KILL_DELAY_MS)
      forceKillTimer.unref()
      settle(() =>
        reject(
          new Error(
            `${invocation.command} ${action} timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds and was terminated.`,
          ),
        ),
      )
    }, COMMAND_TIMEOUT_MS)
    timeoutTimer.unref()
    child.stdout.on('data', (chunk: Uint8Array) =>
      stdout.push(Buffer.from(chunk)),
    )
    child.stderr.on('data', (chunk: Uint8Array) =>
      stderr.push(Buffer.from(chunk)),
    )
    child.once('error', (error) => settle(() => reject(error)))
    child.once('close', (code, signal) => {
      closed = true
      clearTimeout(forceKillTimer)
      const output = Buffer.concat([...stdout, ...stderr])
        .toString('utf8')
        .trim()
      if (signal !== null) {
        settle(() =>
          reject(
            new Error(
              `${invocation.command} ${action} was terminated by signal ${signal}.${output ? ` ${output}` : ''}`,
            ),
          ),
        )
        return
      }
      if (code !== 0) {
        settle(() =>
          reject(
            new Error(
              output || `${invocation.command} exited with code ${code}.`,
            ),
          ),
        )
        return
      }
      settle(() => resolve({action, client, output}))
    })
  })
}

export function parseMcpClient(value: string): McpClient {
  if (value === 'codex' || value === 'claude') return value
  throw new Error('CLIENT must be codex or claude.')
}
