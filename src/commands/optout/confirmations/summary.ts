import {BaseCommand} from '../../../base-command.js'
import {
  readConfirmationSummary,
  renderConfirmationSummary,
} from '../../../services/stop-confirmations.js'

export default class ConfirmationSummary extends BaseCommand {
  static override description =
    'Read 30-day STOP acknowledgement outcome counts. Provider acceptance does not confirm delivery.'
  async run(): Promise<void> {
    const {flags} = await this.parse(ConfirmationSummary)
    const result = await readConfirmationSummary(
      await this.platformClient(flags),
    )
    this.writeValue(result, renderConfirmationSummary(result.data), flags)
  }
}
