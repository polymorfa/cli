import {BaseCommand} from '../../base-command.js'
import {
  customerStatus,
  renderCustomerStatus,
  requireCustomerProject,
} from '../../services/customers.js'

export default class CustomerStatus extends BaseCommand {
  static override description =
    'Check whether Customers is enabled for a project.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CustomerStatus)
    const result = await customerStatus(
      await this.platformClient(flags),
      requireCustomerProject(flags.project),
    )
    this.writeValue(result, renderCustomerStatus(result.data), flags)
  }
}
