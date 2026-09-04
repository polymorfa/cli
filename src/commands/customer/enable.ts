import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  enableCustomers,
  requireCustomerProject,
} from '../../services/customers.js'

export default class CustomerEnable extends BaseCommand {
  static override description =
    'Enable Customers and assign existing Numbers to the default Customer.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify this enablement attempt for safe retries.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CustomerEnable)
    const result = await enableCustomers(
      await this.platformClient(flags),
      requireCustomerProject(flags.project),
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Enabled Customers and assigned ${result.data.migratedNumberCount} existing Numbers.`,
      flags,
    )
  }
}
