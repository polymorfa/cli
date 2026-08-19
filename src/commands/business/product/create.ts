import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  createBusinessProduct,
  renderBusinessMutation,
  renderBusinessProduct,
} from '../../../services/business.js'

export default class BusinessProductCreate extends BaseCommand {
  static override description =
    'Create a business product from a JSON document.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this product creation.',
    }),
    input: Flags.string({
      description:
        'Read the complete JSON product from a file or standard input (-).',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessProductCreate)
    const result = await createBusinessProduct(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      await readJsonInput(flags.input),
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      'requestId' in result.data
        ? renderBusinessMutation(result.data, '')
        : renderBusinessProduct(result.data),
      flags,
    )
  }
}
