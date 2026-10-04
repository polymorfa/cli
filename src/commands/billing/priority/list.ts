import {BaseCommand} from '../../../base-command.js'
import {
  getPriorities,
  renderPriorities,
} from '../../../services/billing-controls.js'
export default class PriorityList extends BaseCommand {
  static override summary =
    'Read project, customer and number funding priorities.'
  static override description =
    'Requires an organization key with billing:read. Project priority takes precedence. Numbers inherit customer priority; a higher number priority overrides it. Use --project for its funding controls. Includes the revision used for changes.'
  async run(): Promise<void> {
    const {flags} = await this.parse(PriorityList)
    const result = await getPriorities(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderPriorities(result.data), flags)
  }
}
