import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderCustomer,
  requireCustomerProject,
  updateCustomer,
} from '../../services/customers.js'

export default class CustomerUpdate extends BaseCommand {
  static override args = {
    customer: Args.string({description: 'Customer ID.', required: true}),
  }

  static override description = 'Update Customer profile fields.'

  static override flags = {
    'clear-external-id': Flags.boolean({
      description: 'Clear the caller-defined Customer ID.',
      exclusive: ['external-id'],
    }),
    'clear-name': Flags.boolean({
      description: 'Clear the Customer name.',
      exclusive: ['name'],
    }),
    'external-id': Flags.string({
      description: 'New caller-defined Customer ID.',
    }),
    name: Flags.string({description: 'New Customer name.'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CustomerUpdate)
    const result = await updateCustomer(
      await this.platformClient(flags),
      args.customer,
      {
        projectId: requireCustomerProject(flags.project),
        ...(flags.name === undefined && flags['clear-name'] !== true
          ? {}
          : {name: flags.name ?? null}),
        ...(flags['external-id'] === undefined &&
        flags['clear-external-id'] !== true
          ? {}
          : {
              externalCustomerId: flags['external-id'] ?? null,
            }),
      },
    )
    this.writeValue(result, renderCustomer(result.data), flags)
  }
}
