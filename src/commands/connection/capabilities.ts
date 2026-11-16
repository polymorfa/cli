import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  getConnectionCapabilities,
  renderConnectionCapabilities,
} from '../../services/platform-management.js'

export default class ConnectionCapabilitiesCommand extends BaseCommand {
  static override args = {
    connection: Args.string({
      description: 'Connection ID or name.',
      required: true,
    }),
  }

  static override description =
    "Show the WhatsApp features and limits WhatsApp has enabled for a Connection, as of the Connection's last configuration sync. Beta: the team must be enrolled."

  static override examples = [
    '<%= config.bin %> connection capabilities support-line',
    '<%= config.bin %> connection capabilities support-line --json',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionCapabilitiesCommand)
    const result = await getConnectionCapabilities(
      await this.platformClient(flags),
      args.connection,
    )
    this.writeValue(result, renderConnectionCapabilities(result.data), flags)
  }
}
