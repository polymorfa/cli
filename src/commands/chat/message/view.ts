import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderHistoryMessage,
  viewHistoryMessage,
} from '../../../services/history.js'

export default class ChatMessageView extends BaseCommand {
  static override args = {
    conversation: Args.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
    message: Args.string({
      description: 'Opaque Polymorfa message ID.',
      required: true,
    }),
  }

  static override description =
    'View one stored message for an enrolled HMS Number (beta). Requires messages:read.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChatMessageView)
    const result = await viewHistoryMessage(
      await this.historyMessagingClient(flags),
      flags.session,
      args.conversation,
      args.message,
    )
    this.writeValue(result, renderHistoryMessage(result.data), flags)
  }
}
