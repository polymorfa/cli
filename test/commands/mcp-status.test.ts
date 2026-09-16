import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const clientCommand = vi.hoisted(() => ({
  run: vi.fn(),
}))

vi.mock('../../src/mcp/client-command.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/mcp/client-command.js')>()
  return {...original, runMcpClientCommand: clientCommand.run}
})

import McpStatus from '../../src/commands/mcp/status.js'

describe('mcp status', () => {
  beforeEach(() => clientCommand.run.mockReset())
  afterEach(() => vi.restoreAllMocks())

  test('maps the client expected missing-server result to not configured', async () => {
    clientCommand.run.mockRejectedValueOnce(
      new Error("Error: No MCP server named 'polymorfa' found."),
    )
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    await McpStatus.run(['codex', '--json'])

    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual([
      {client: 'codex', configured: false},
    ])
  })

  test('rethrows client execution failures instead of calling them not configured', async () => {
    clientCommand.run.mockRejectedValueOnce(new Error('spawn codex ENOENT'))
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await McpStatus.run(['codex', '--json']).catch(
      (caught: unknown) => caught,
    )

    expect(exitCode(error)).toBe(1)
    expect(output).not.toHaveBeenCalled()
  })

  test('reports a client whose executable is missing as not configured', async () => {
    const missing = Object.assign(new Error('spawn claude ENOENT'), {
      code: 'ENOENT',
      errno: -2,
      path: 'claude',
      syscall: 'spawn claude',
    })
    clientCommand.run
      .mockResolvedValueOnce({action: 'status', client: 'codex', output: 'ok'})
      .mockRejectedValueOnce(missing)
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    await McpStatus.run(['--json'])

    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual([
      {client: 'codex', configured: true, output: 'ok'},
      {client: 'claude', configured: false, reason: 'client_not_found'},
    ])
  })

  test('recognizes the Claude CLI missing-server result', async () => {
    clientCommand.run.mockRejectedValueOnce(
      new Error('No MCP server named "polymorfa". Configured servers: example'),
    )
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    await McpStatus.run(['claude', '--json'])

    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual([
      {client: 'claude', configured: false},
    ])
  })
})

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error)) {
    return undefined
  }
  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
