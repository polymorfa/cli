import {PassThrough} from 'node:stream'

import {StdioServerTransport} from '@modelcontextprotocol/server/stdio'
import {afterEach, describe, expect, test} from 'vitest'

import {ListenerManager} from '../../src/mcp/listener-manager.js'
import {serveMcp} from '../../src/mcp/server.js'

describe('MCP stdio server', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => close?.())

  test('negotiates listener controls and project-scoped session discovery', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new StdioServerTransport(input, output)
    const manager = new ListenerManager(
      async () => new Promise<never>(() => {}),
    )
    const handle = serveMcp(manager, '0.1.0-test', transport, () =>
      Promise.resolve({sessions: [], status: 200}),
    )
    close = () => handle.close()

    const messages = collectMessages(output)
    input.write(
      `${JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: {name: 'test', version: '1.0.0'},
          protocolVersion: '2025-06-18',
        },
      })}\n`,
    )
    await waitFor(messages, 1)
    input.write(
      `${JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}\n`,
    )
    input.write(
      `${JSON.stringify({id: 2, jsonrpc: '2.0', method: 'tools/list', params: {}})}\n`,
    )
    await waitFor(messages, 2)

    expect(messages[0]).toMatchObject({
      id: 1,
      result: {serverInfo: {name: '@polymorfa/cli', version: '0.1.0-test'}},
    })
    expect(
      (
        (messages[1] as {result: {tools: Array<{name: string}>}}).result
          .tools ?? []
      ).map(({name}) => name),
    ).toEqual([
      'polymorfa_listen_start',
      'polymorfa_listen_status',
      'polymorfa_listen_stop',
      'polymorfa_session_list',
    ])
    const start = (
      messages[1] as {
        result: {
          tools: Array<{
            name: string
            inputSchema: {properties: Record<string, {pattern?: string}>}
          }>
        }
      }
    ).result.tools.find(({name}) => name === 'polymorfa_listen_start')
    const pattern = new RegExp(
      start?.inputSchema.properties.projectId?.pattern ?? '',
    )
    expect(pattern.test('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(pattern.test('project_123')).toBe(false)
    expect(pattern.test('11111111-1111-4111-8111-11111111111G')).toBe(false)
    const sessions = (
      messages[1] as {
        result: {
          tools: Array<{
            name: string
            annotations?: {readOnlyHint?: boolean}
            inputSchema: {properties: Record<string, {pattern?: string}>}
          }>
        }
      }
    ).result.tools.find(({name}) => name === 'polymorfa_session_list')
    expect(sessions?.annotations?.readOnlyHint).toBe(true)
    expect(
      new RegExp(
        sessions?.inputSchema.properties.projectId?.pattern ?? '',
      ).test('project_123'),
    ).toBe(false)
  })

  test('returns only curated session fields and hides failures', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new StdioServerTransport(input, output)
    const manager = new ListenerManager(
      async () => new Promise<never>(() => {}),
    )
    const projectId = '11111111-1111-4111-8111-111111111111'
    let requests = 0
    const handle = serveMcp(manager, '0.1.0-test', transport, (project) => {
      expect(project).toBe(projectId)
      if (requests++ > 0) {
        return Promise.reject(new Error('Bearer pmfa_secret_value'))
      }
      return Promise.resolve({
        sessions: [
          {
            sessionId: 'session_1',
            name: 'Support',
            status: 'CONNECTED',
            testMode: false,
          },
        ],
        status: 200,
      })
    })
    close = () => handle.close()

    const messages = collectMessages(output)
    input.write(
      `${JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: {name: 'test', version: '1.0.0'},
          protocolVersion: '2025-06-18',
        },
      })}\n`,
    )
    await waitFor(messages, 1)
    input.write(
      `${JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}\n`,
    )
    input.write(
      `${JSON.stringify({
        id: 2,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {name: 'polymorfa_session_list', arguments: {projectId}},
      })}\n`,
    )
    await waitFor(messages, 2)
    expect(messages[1]).toMatchObject({
      id: 2,
      result: {
        structuredContent: {
          sessions: [{sessionId: 'session_1', status: 'CONNECTED'}],
          status: 200,
        },
      },
    })
    expect(JSON.stringify(messages[1])).not.toContain('phone')

    input.write(
      `${JSON.stringify({
        id: 3,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {name: 'polymorfa_session_list', arguments: {projectId}},
      })}\n`,
    )
    await waitFor(messages, 3)
    expect(messages[2]).toMatchObject({id: 3, result: {isError: true}})
    expect(JSON.stringify(messages[2])).not.toContain('pmfa_secret_value')
  })
})

function collectMessages(stream: PassThrough): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  let pending = ''
  stream.on('data', (chunk: unknown) => {
    pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0)
        messages.push(JSON.parse(line) as Record<string, unknown>)
    }
  })
  return messages
}

async function waitFor(
  messages: readonly unknown[],
  count: number,
): Promise<void> {
  const deadline = Date.now() + 2000
  while (messages.length < count) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for MCP output.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
