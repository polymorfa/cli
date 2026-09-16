import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {getHealthPolicy, renderHealthPolicy} from '../../../services/bansafe.js'

export default class BanSafeHealthPolicyView extends BaseCommand {
  static override description = 'View the BanSafe Health rule for one project.'
  static override flags = {
    project: Flags.string({description: 'Project ID.', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeHealthPolicyView)
    const result = await getHealthPolicy(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderHealthPolicy(result.data), flags)
  }
}
