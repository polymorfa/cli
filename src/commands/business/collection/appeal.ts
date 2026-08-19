import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  appealBusinessCollection,
  renderBusinessMutation,
} from '../../../services/business.js'

export default class BusinessCollectionAppeal extends BaseCommand {
  static override args = {
    collection: Args.string({
      description: 'Business collection ID.',
      required: true,
    }),
  }

  static override description = 'Appeal a rejected business collection.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this collection appeal.',
    }),
    reason: Flags.string({description: 'Appeal reason.', required: true}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessCollectionAppeal)
    const result = await appealBusinessCollection(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.collection,
      flags.reason,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(
        result.data,
        `Appealed collection ${args.collection}.`,
      ),
      flags,
    )
  }
}
