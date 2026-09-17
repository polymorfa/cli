import {BaseCommand} from '../../base-command.js'
import {
  LISTENER_PROTOCOL_SHA256,
  LISTENER_PROTOCOL_VERSION,
} from '../../listener/protocol.js'
import {MCP_TOOL_NAMES} from '../../mcp/server.js'

export default class McpDoctor extends BaseCommand {
  static override description =
    'Check the local MCP runtime and listener protocol pin.'

  async run(): Promise<void> {
    const {flags} = await this.parse(McpDoctor)
    const major = Number(process.versions.node.split('.')[0])
    const result = {
      listenerProtocolSha256: LISTENER_PROTOCOL_SHA256,
      listenerProtocolVersion: LISTENER_PROTOCOL_VERSION,
      node: process.versions.node,
      nodeSupported: major >= 20,
      tools: MCP_TOOL_NAMES.length,
    }
    this.writeValue(
      result,
      `Node ${result.node}: ${result.nodeSupported ? 'supported' : 'unsupported'}\nListener protocol ${result.listenerProtocolVersion}: ${result.listenerProtocolSha256}`,
      flags,
    )
  }
}
