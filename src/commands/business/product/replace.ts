import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessMutation,
  renderBusinessProduct,
  replaceBusinessProduct,
} from '../../../services/business.js'

export default class BusinessProductReplace extends BaseCommand {
  static override args = {
    product: Args.string({description: 'Business product ID.', required: true}),
  }

  static override description =
    'Replace a business product from a JSON document.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this product replacement.',
    }),
    input: Flags.string({
      description:
        'Read the complete JSON replacement from a file or standard input (-).',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessProductReplace)
    const result = await replaceBusinessProduct(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.product,
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
