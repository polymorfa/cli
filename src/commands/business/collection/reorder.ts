import {Flags} from '@oclif/core'

import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessMutation,
  reorderBusinessCollections,
} from '../../../services/business.js'

export default class BusinessCollectionReorder extends BaseCommand {
  static override description =
    'Reorder business collections from a JSON move list.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this collection reorder.',
    }),
    input: Flags.string({
      description: 'Read {"moves":[...]} from a file or standard input (-).',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessCollectionReorder)
    const result = await reorderBusinessCollections(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      await readJsonInput(flags.input),
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, 'Reordered business collections.'),
      flags,
    )
  }
}
