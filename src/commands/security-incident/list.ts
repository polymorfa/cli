import {BaseCommand} from '../../base-command.js'
import {
  listSecurityIncidents,
  renderSecurityIncidents,
} from '../../services/platform-management.js'

export default class SecurityIncidentList extends BaseCommand {
  static override description = 'List organization security incidents.'

  async run(): Promise<void> {
    const {flags} = await this.parse(SecurityIncidentList)
    const result = await listSecurityIncidents(await this.platformClient(flags))
    this.writeValue(result, renderSecurityIncidents(result.data), flags)
  }
}
