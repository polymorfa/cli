import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {deleteQuickReply} from '../../services/quick-replies.js'

export default class QuickReplyDelete extends BaseCommand {
  static override args = {
    'quick-reply': Args.string({
      description: 'Quick-reply ID.',
      required: true,
    }),
  }

  static override description = 'Delete a quick reply.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this delete operation.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent quick-reply deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(QuickReplyDelete)
    const id = args['quick-reply']
    const result = await deleteQuickReply(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Quick Reply'}),
      flags.session,
      id,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Deleted quick reply ${id}.`, flags)
  }
}
