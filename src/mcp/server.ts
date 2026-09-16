import {McpServer} from '@modelcontextprotocol/server'
import {
  serveStdio,
  type StdioServerTransport,
} from '@modelcontextprotocol/server/stdio'
import {z} from 'zod'

import {LISTENER_PROJECT_ID_PATTERN} from '../listener/protocol.js'
import type {ListenerManager} from './listener-manager.js'

export const MCP_TOOL_NAMES = [
  'polymorfa_listen_start',
  'polymorfa_listen_status',
  'polymorfa_listen_stop',
] as const

export function createMcpServer(
  manager: ListenerManager,
  version: string,
): McpServer {
  const server = new McpServer({name: '@polymorfa/cli', version})
  server.registerTool(
    'polymorfa_listen_start',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        'Start an in-process Polymorfa event listener that forwards to local development endpoints.',
      inputSchema: z.object({
        allowRemoteForward: z.boolean().optional(),
        checkpointFile: z.string().optional(),
        events: z.array(z.string()).min(1).max(32).optional(),
        followRedirects: z.boolean().optional(),
        forwardSecretOut: z.string().min(1),
        forwardTo: z.array(z.string()).min(1).max(8),
        from: z.string().optional(),
        maxBuffer: z.number().int().min(1).max(4096).optional(),
        onGap: z.enum(['stop', 'continue']).optional(),
        projectId: z.string().regex(LISTENER_PROJECT_ID_PATTERN),
      }),
      title: 'Start Polymorfa listener',
    },
    async (input) => result(await manager.start(input)),
  )
  server.registerTool(
    'polymorfa_listen_status',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: 'Inspect listeners owned by this MCP stdio server.',
      inputSchema: z.object({listenerId: z.string().optional()}),
      title: 'Inspect Polymorfa listeners',
    },
    async (input) => result(await manager.status(input)),
  )
  server.registerTool(
    'polymorfa_listen_stop',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Stop one in-process listener owned by this MCP stdio server.',
      inputSchema: z.object({listenerId: z.string().min(1)}),
      title: 'Stop Polymorfa listener',
    },
    async ({listenerId}) => result(await manager.stop(listenerId)),
  )
  return server
}

export function serveMcp(
  manager: ListenerManager,
  version: string,
  transport?: StdioServerTransport,
): {close(): Promise<void>} {
  const handle = serveStdio(() => createMcpServer(manager, version), {
    onerror(error) {
      process.stderr.write(`MCP error: ${error.message}\n`)
    },
    ...(transport === undefined ? {} : {transport}),
  })
  return {
    async close(): Promise<void> {
      await manager.close()
      await handle.close()
    },
  }
}

function result(value: object) {
  return {
    content: [{text: JSON.stringify(value), type: 'text' as const}],
    structuredContent: value,
  }
}
