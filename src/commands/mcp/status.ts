import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {parseMcpClient, runMcpClientCommand} from '../../mcp/client-command.js'

export default class McpStatus extends BaseCommand {
  static override args = {
    client: Args.string({options: ['codex', 'claude'], required: false}),
  }
  static override description =
    'Inspect Polymorfa MCP configuration in supported clients.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpStatus)
    const clients = args.client
      ? [parseMcpClient(args.client)]
      : (['codex', 'claude'] as const)
    const results = await Promise.allSettled(
      clients.map((client) => runMcpClientCommand(client, 'status')),
    )
    const status = results.map((result, index) => {
      const client = clients[index]
      if (client === undefined)
        throw new Error('MCP status result was unbound.')
      if (result.status === 'fulfilled') {
        return {client, configured: true, output: result.value.output}
      }
      const reason = result.reason as unknown
      if (isMissingClient(client, reason)) {
        return {client, configured: false, reason: 'client_not_found'}
      }
      if (isNotConfigured(client, reason)) {
        return {client, configured: false}
      }
      throw reason
    })
    this.writeValue(
      status,
      status
        .map(
          (item) =>
            `${item.client}: ${
              item.configured
                ? 'configured'
                : 'reason' in item
                  ? `not configured (${item.client} command not found)`
                  : 'not configured'
            }`,
        )
        .join('\n'),
      flags,
    )
  }
}

function isMissingClient(client: 'codex' | 'claude', error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const {code, syscall} = error as NodeJS.ErrnoException
  return code === 'ENOENT' && syscall === `spawn ${client}`
}

function isNotConfigured(client: 'codex' | 'claude', error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (client === 'codex') {
    return /(?:^|\n)Error: No MCP server named 'polymorfa' found\.$/.test(
      error.message,
    )
  }
  return error.message.startsWith('No MCP server named "polymorfa".')
}
