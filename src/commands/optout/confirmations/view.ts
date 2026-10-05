import {BaseCommand} from '../../../base-command.js'
import {
  readConfirmationSettings,
  renderConfirmationSettings,
} from '../../../services/stop-confirmations.js'

export default class ConfirmationSettingsView extends BaseCommand {
  static override description =
    'Read the team’s optional STOP acknowledgement preference. Disabled by default; enabling requires beta access.'
  async run(): Promise<void> {
    const {flags} = await this.parse(ConfirmationSettingsView)
    const result = await readConfirmationSettings(
      await this.platformClient(flags),
    )
    this.writeValue(result, renderConfirmationSettings(result.data), flags)
  }
}
