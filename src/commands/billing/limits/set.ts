import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {setLimit, limitValue} from '../../../services/billing-controls.js'
export default class LimitsSet extends BaseCommand {
  static override summary = 'Set or remove a monthly spending limit.'
  static override description =
    'Requires Pay-As-You-Go and an organization key with billing:manage. Zero blocks new charges; already-paid service continues. A stale observed revision fails without overwriting newer settings.'
  static override args = {
    id: Args.string({required: true, description: 'Project or number UUID.'}),
  }
  static override flags = {
    scope: Flags.string({
      options: ['project', 'customer', 'number'],
      required: true,
    }),
    credits: Flags.string({
      description: 'Monthly Polymorfa credits, up to six decimal places.',
    }),
    unlimited: Flags.boolean({
      description: 'Remove the limit.',
      exclusive: ['credits'],
    }),
    'expected-revision': Flags.integer({
      required: true,
      min: 0,
      description: 'Revision from billing limits list.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(LimitsSet)
    const value = limitValue(flags.credits, flags.unlimited)
    const result = await setLimit(
      await this.platformClient(flags),
      flags.scope as 'project' | 'customer' | 'number',
      args.id,
      value,
      flags['expected-revision'],
    )
    this.writeValue(result, 'Spending limit saved.', flags)
  }
}
