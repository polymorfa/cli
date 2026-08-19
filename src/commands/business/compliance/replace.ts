import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessMutation,
  replaceBusinessCompliance,
} from '../../../services/business.js'

export default class BusinessComplianceReplace extends BaseCommand {
  static override description = 'Replace complete business merchant compliance.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this compliance replacement.',
    }),
    input: Flags.string({
      description:
        'Read the complete JSON compliance body from a file or standard input (-).',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessComplianceReplace)
    const result = await replaceBusinessCompliance(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      await readJsonInput(flags.input),
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, 'Replaced business compliance.'),
      flags,
    )
  }
}
