import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  createCustomer,
  renderCustomer,
  requireCustomerProject,
} from '../../services/customers.js'

export default class CustomerCreate extends BaseCommand {
  static override description = 'Create a Customer.'

  static override flags = {
    'external-id': Flags.string({description: 'Caller-defined Customer ID.'}),
    'idempotency-key': Flags.string({
      description: 'Identify this create attempt for safe retries.',
      required: true,
    }),
    name: Flags.string({description: 'Customer name.'}),
    phone: Flags.string({
      description: 'Customer phone number in E.164 format.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CustomerCreate)
    const result = await createCustomer(
      await this.platformClient(flags),
      {
        projectId: requireCustomerProject(flags.project),
        ...(flags.name === undefined ? {} : {name: flags.name}),
        ...(flags.phone === undefined ? {} : {phone: flags.phone}),
        ...(flags['external-id'] === undefined
          ? {}
          : {externalCustomerId: flags['external-id']}),
      },
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCustomer(result.data), flags)
  }
}
