import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {setPriority} from '../../../services/billing-controls.js'
export default class PrioritySet extends BaseCommand {
  static override summary = 'Set a project or number funding priority.'
  static override description =
    'Requires Pay-As-You-Go and an organization key with billing:manage. Changes future renewal protection and recovery; paid windows keep their expiry.'
  static override args = {
    id: Args.string({required: true, description: 'Project or number UUID.'}),
  }
  static override flags = {
    scope: Flags.string({
      options: ['project', 'customer', 'number'],
      required: true,
    }),
    priority: Flags.integer({required: true, min: 0, max: 1000000}),
    'expected-revision': Flags.integer({required: true, min: 0}),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(PrioritySet)
    const result = await setPriority(
      await this.platformClient(flags),
      flags.scope as 'project' | 'customer' | 'number',
      args.id,
      flags.priority,
      flags['expected-revision'],
    )
    this.writeValue(result, 'Priority saved.', flags)
  }
}
