import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {parseMcpClient, runMcpClientCommand} from '../../mcp/client-command.js'

export default class McpUninstall extends BaseCommand {
  static override args = {
    client: Args.string({options: ['codex', 'claude'], required: true}),
  }
  static override description =
    'Remove the Polymorfa MCP server from a supported client.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpUninstall)
    const result = await runMcpClientCommand(
      parseMcpClient(args.client),
      'uninstall',
    )
    this.writeValue(
      result,
      `Removed Polymorfa MCP from ${result.client}.`,
      flags,
    )
  }
}
