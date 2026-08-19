import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listQuickReplies} from '../../services/quick-replies.js'

export default class QuickReplyList extends BaseCommand {
  static override description = 'List observed quick replies for a session.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(QuickReplyList)
    const result = await listQuickReplies(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Quick Reply'}),
      flags.session,
    )
    const replies = result.data.quickReplies
    const human =
      replies.length === 0
        ? `No quick replies found (${result.data.status}).`
        : replies
            .map((reply) => `${reply.id}\t${reply.shortcut}\t${reply.message}`)
            .join('\n')
    this.writeValue(result, human, flags)
  }
}
