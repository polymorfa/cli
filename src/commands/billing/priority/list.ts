import {BaseCommand} from '../../../base-command.js'
import {
  getPriorities,
  renderPriorities,
} from '../../../services/billing-controls.js'
export default class PriorityList extends BaseCommand {
  static override summary = 'Read project and number funding priorities.'
  static override description =
    'Requires an organization key with billing:read. Higher project priority takes precedence, followed by number priority. Includes the revision used for changes.'
  async run(): Promise<void> {
    const {flags} = await this.parse(PriorityList)
    const result = await getPriorities(await this.platformClient(flags))
    this.writeValue(result, renderPriorities(result.data), flags)
  }
}
