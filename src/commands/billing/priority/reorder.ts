import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {reorderPriorities} from '../../../services/billing-controls.js'
export default class PriorityReorder extends BaseCommand {
  static override summary = 'Save a complete funding order atomically.'
  static override description =
    'Requires Pay-As-You-Go and an organization key with billing:manage. Pass every active project, or every real number in --project, highest first. Incomplete or stale orders fail without partial changes.'
  static override flags = {
    scope: Flags.string({
      options: ['project', 'customer', 'number'],
      required: true,
    }),
    ids: Flags.string({
      required: true,
      description: 'Comma-separated UUIDs, highest first.',
    }),
    'expected-revision': Flags.integer({required: true, min: 0}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(PriorityReorder)
    const result = await reorderPriorities(
      await this.platformClient(flags),
      flags.scope as 'project' | 'customer' | 'number',
      flags.ids.split(',').map((id) => id.trim()),
      flags['expected-revision'],
      flags.project,
    )
    this.writeValue(result, 'Priority order saved.', flags)
  }
}
