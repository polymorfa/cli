import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {getWarmupPlan, renderWarmupPlan} from '../../../services/bansafe.js'

export default class BanSafeWarmupView extends BaseCommand {
  static override description = 'View the warmup plan for one project.'
  static override flags = {
    project: Flags.string({description: 'Project ID.', required: true}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeWarmupView)
    const result = await getWarmupPlan(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderWarmupPlan(result.data), flags)
  }
}
