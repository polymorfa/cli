import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  getSessionCapabilities,
  renderSessionCapabilities,
} from '../../services/platform-management.js'

export default class SessionCapabilitiesCommand extends BaseCommand {
  static override args = {
    session: Args.string({
      description: 'Session ID or name.',
      required: true,
    }),
  }

  static override description =
    "Show the WhatsApp features and limits WhatsApp has enabled for a number, as of the number's last configuration sync. Beta: the team must be enrolled."

  static override examples = [
    '<%= config.bin %> session capabilities support-line',
    '<%= config.bin %> session capabilities support-line --json',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionCapabilitiesCommand)
    const result = await getSessionCapabilities(
      await this.platformClient(flags),
      args.session,
    )
    this.writeValue(result, renderSessionCapabilities(result.data), flags)
  }
}
