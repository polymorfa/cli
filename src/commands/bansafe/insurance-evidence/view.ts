import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  getInsuranceEvidence,
  renderInsuranceEvidence,
} from '../../../services/bansafe.js'

export default class BanSafeInsuranceEvidenceView extends BaseCommand {
  static override description = 'View project insurance evidence collection.'
  static override flags = {
    project: Flags.string({description: 'Project ID.', required: true}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeInsuranceEvidenceView)
    const result = await getInsuranceEvidence(
      await this.platformClient(flags),
      flags.project,
    )
    this.writeValue(result, renderInsuranceEvidence(result.data), flags)
  }
}
