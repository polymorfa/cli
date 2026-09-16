import {BaseCommand} from '../../base-command.js'
import {MCP_TOOL_NAMES} from '../../mcp/server.js'

export default class McpTools extends BaseCommand {
  static override description =
    'List tools exposed by the local Polymorfa MCP server.'

  async run(): Promise<void> {
    const {flags} = await this.parse(McpTools)
    this.writeValue({tools: MCP_TOOL_NAMES}, MCP_TOOL_NAMES.join('\n'), flags)
  }
}
