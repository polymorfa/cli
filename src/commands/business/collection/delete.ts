import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  deleteBusinessCollection,
  renderBusinessMutation,
} from '../../../services/business.js'

export default class BusinessCollectionDelete extends BaseCommand {
  static override args = {
    collection: Args.string({
      description: 'Business collection ID.',
      required: true,
    }),
  }

  static override description = 'Delete a business collection.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this collection deletion.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent collection deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessCollectionDelete)
    const result = await deleteBusinessCollection(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.collection,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(
        result.data,
        `Deleted collection ${args.collection}.`,
      ),
      flags,
    )
  }
}
