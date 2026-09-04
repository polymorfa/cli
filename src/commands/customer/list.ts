import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  listCustomers,
  renderCustomers,
  requireCustomerProject,
} from '../../services/customers.js'

export default class CustomerList extends BaseCommand {
  static override description = 'List Customers in one project.'

  static override flags = {
    cursor: Flags.string({description: 'Continue from this cursor.'}),
    default: Flags.string({
      description: 'Filter by default-Customer status.',
      options: ['true', 'false'],
    }),
    'has-numbers': Flags.string({
      description: 'Filter by whether a Customer has assigned Numbers.',
      options: ['true', 'false'],
    }),
    limit: Flags.integer({
      description: 'Maximum Customers to return.',
      max: 100,
      min: 1,
    }),
    'needs-attention': Flags.string({
      description: 'Filter by whether a Customer needs attention.',
      options: ['true', 'false'],
    }),
    search: Flags.string({description: 'Search Customer profile fields.'}),
    status: Flags.string({
      description: 'Filter by Customer status.',
      options: ['active', 'archiving', 'archived', 'all'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CustomerList)
    const result = await listCustomers(await this.platformClient(flags), {
      projectId: requireCustomerProject(flags.project),
      ...(flags.cursor === undefined ? {} : {cursor: flags.cursor}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
      ...(flags.search === undefined ? {} : {search: flags.search}),
      ...(flags.status === undefined
        ? {}
        : {
            status: flags.status as 'active' | 'archiving' | 'archived' | 'all',
          }),
      ...(flags.default === undefined
        ? {}
        : {isDefault: flags.default === 'true'}),
      ...(flags['has-numbers'] === undefined
        ? {}
        : {hasNumbers: flags['has-numbers'] === 'true'}),
      ...(flags['needs-attention'] === undefined
        ? {}
        : {needsAttention: flags['needs-attention'] === 'true'}),
    })
    this.writeValue(result, renderCustomers(result.data), flags)
  }
}
