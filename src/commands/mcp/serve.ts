import {BaseCommand} from '../../base-command.js'
import {createListenerManager} from '../../mcp/factory.js'
import {serveMcp} from '../../mcp/server.js'

export default class McpServe extends BaseCommand {
  static override description =
    'Serve Polymorfa listener controls over MCP stdio.'

  async run(): Promise<void> {
    await this.parse(McpServe)
    const manager = createListenerManager(this.config.version)
    const handle = serveMcp(manager, this.config.version)
    const stop = () => void handle.close()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }
}
