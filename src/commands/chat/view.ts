import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderHistoryChat, viewHistoryChat} from '../../services/history.js'

export default class ChatView extends BaseCommand {
  static override args = {
    conversation: Args.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
  }

  static override description =
    'View one stored chat for an enrolled HMS Number (beta). Requires chats:read.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChatView)
    const result = await viewHistoryChat(
      await this.historyMessagingClient(flags),
      flags.session,
      args.conversation,
    )
    this.writeValue(result, renderHistoryChat(result.data), flags)
  }
}
