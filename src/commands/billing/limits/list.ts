import {BaseCommand} from '../../../base-command.js'
import {getLimits, renderLimits} from '../../../services/billing-controls.js'
export default class LimitsList extends BaseCommand {
  static override summary = 'Read monthly project and number spending limits.'
  static override description =
    'Requires an team key with billing:read. Use --project to include its number limits. Months reset on the first day at 00:00 UTC.'
  async run(): Promise<void> {
    const {flags} = await this.parse(LimitsList)
    const result = await getLimits(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderLimits(result.data), flags)
  }
}
