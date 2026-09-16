import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderHealthPolicy,
  updateHealthPolicy,
} from '../../../services/bansafe.js'

export default class BanSafeHealthPolicyUpdate extends BaseCommand {
  static override description =
    'Replace the BanSafe Health rule for one project.'
  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this convergent policy update.',
      required: true,
    }),
    input: Flags.string({
      description:
        'Read the complete policy JSON object from a file or standard input (-).',
      required: true,
    }),
    project: Flags.string({description: 'Project ID.', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeHealthPolicyUpdate)
    const result = await updateHealthPolicy(
      await this.platformClient(flags),
      flags.project,
      await readJsonInput(flags.input),
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderHealthPolicy(result.data), flags)
  }
}
