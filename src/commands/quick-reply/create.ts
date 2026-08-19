import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createQuickReply} from '../../services/quick-replies.js'

export default class QuickReplyCreate extends BaseCommand {
  static override description = 'Create a quick reply.'

  static override flags = {
    count: Flags.integer({description: 'Initial source count.'}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this create operation.',
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
      description: 'Quick-reply shortcut, such as /hours.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(QuickReplyCreate)
    const result = await createQuickReply(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Quick Reply'}),
      flags.session,
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
      `Created quick reply ${result.data.shortcut} (${result.data.id}).`,
      flags,
    )
  }
}
