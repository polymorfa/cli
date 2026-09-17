import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {renderWarmupPlan, updateWarmupPlan} from '../../../services/bansafe.js'

export default class BanSafeWarmupUpdate extends BaseCommand {
  static override description = 'Update the warmup plan for one project.'
  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this update.',
      required: true,
    }),
    input: Flags.string({
      description:
        'Read a warmup-plan JSON patch from a file or standard input (-).',
      required: true,
    }),
    project: Flags.string({description: 'Project ID.', required: true}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeWarmupUpdate)
    const result = await updateWarmupPlan(
      await this.platformClient(flags),
      flags.project,
      await readJsonInput(flags.input),
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderWarmupPlan(result.data), flags)
  }
}
