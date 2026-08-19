import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {replaceQuickReply} from '../../services/quick-replies.js'

export default class QuickReplyReplace extends BaseCommand {
  static override args = {
    'quick-reply': Args.string({
      description: 'Quick-reply ID.',
      required: true,
    }),
  }

  static override description = 'Replace a complete quick reply.'

  static override flags = {
    count: Flags.integer({description: 'Replacement source count.'}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this replacement.',
    }),
    keyword: Flags.string({
      description: 'Matching keyword. Repeat to add multiple keywords.',
      multiple: true,
    }),
    message: Flags.string({
      description: 'Complete reply message.',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    shortcut: Flags.string({
      description: 'Complete quick-reply shortcut.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(QuickReplyReplace)
    const result = await replaceQuickReply(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Quick Reply'}),
      flags.session,
      args['quick-reply'],
      {
        message: flags.message,
        shortcut: flags.shortcut,
        ...(flags.keyword === undefined ? {} : {keywords: flags.keyword}),
        ...(flags.count === undefined ? {} : {count: flags.count}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Replaced quick reply ${args['quick-reply']}.`,
      flags,
    )
  }
}
