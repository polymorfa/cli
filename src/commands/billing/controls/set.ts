import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {
  setResourceControls,
  limitValue,
} from '../../../services/billing-controls.js'
export default class ControlsSet extends BaseCommand {
  static override summary = 'Atomically save one resource limit and priority.'
  static override args = {
    id: Args.string({required: true, description: 'Resource UUID.'}),
  }
  static override flags = {
    scope: Flags.string({
      required: true,
      options: ['project', 'customer', 'number'],
    }),
    credits: Flags.string(),
    unlimited: Flags.boolean({exclusive: ['credits']}),
    priority: Flags.integer({required: true, min: 0, max: 1000000}),
    'expected-budget-revision': Flags.integer({required: true, min: 0}),
    'expected-priority-revision': Flags.integer({required: true, min: 0}),
  }
  async run() {
    const {args, flags} = await this.parse(ControlsSet)
    const result = await setResourceControls(
      await this.platformClient(flags),
      flags.scope as 'project' | 'customer' | 'number',
      args.id,
      {
        limitCredits: limitValue(flags.credits, flags.unlimited),
        priority: flags.priority,
        expectedBudgetRevision: flags['expected-budget-revision'],
        expectedPriorityRevision: flags['expected-priority-revision'],
      },
    )
    this.writeValue(result, 'Limits and priority saved.', flags)
  }
}
