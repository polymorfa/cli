import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../../base-command.js'
import {
  deleteBusinessCoverPhoto,
  renderBusinessMutation,
} from '../../../../services/business.js'

export default class BusinessProfileCoverDelete extends BaseCommand {
  static override args = {
    cover: Args.string({
      description: 'Business cover-photo ID.',
      required: true,
    }),
  }

  static override description = 'Delete the business profile cover photo.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this cover-photo deletion.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent cover-photo deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BusinessProfileCoverDelete)
    const result = await deleteBusinessCoverPhoto(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
      args.cover,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      renderBusinessMutation(result.data, `Deleted cover photo ${args.cover}.`),
      flags,
    )
  }
}
