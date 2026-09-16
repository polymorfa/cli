import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {parseMcpClient, runMcpClientCommand} from '../../mcp/client-command.js'

export default class McpInstall extends BaseCommand {
  static override args = {
    client: Args.string({options: ['codex', 'claude'], required: true}),
  }
  static override description =
    'Install the Polymorfa stdio MCP server in a supported client.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpInstall)
    const result = await runMcpClientCommand(
      parseMcpClient(args.client),
      'install',
    )
    this.writeValue(
      result,
      `Installed Polymorfa MCP for ${result.client}.`,
      flags,
    )
  }
}
