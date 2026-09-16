import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderInsuranceEvidence,
  updateInsuranceEvidence,
} from '../../../services/bansafe.js'

export default class BanSafeInsuranceEvidenceUpdate extends BaseCommand {
  static override description = 'Update project insurance evidence collection.'
  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this update.',
      required: true,
    }),
    input: Flags.string({
      description:
        'Read an insurance-evidence JSON object from a file or standard input (-).',
      required: true,
    }),
    project: Flags.string({description: 'Project ID.', required: true}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeInsuranceEvidenceUpdate)
    const result = await updateInsuranceEvidence(
      await this.platformClient(flags),
      flags.project,
      await readJsonInput(flags.input),
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderInsuranceEvidence(result.data), flags)
  }
}
