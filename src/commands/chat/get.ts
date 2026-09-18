import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderChats} from '../../services/history.js'

export default class ChatGet extends BaseCommand {
  static override args = {
    conversation: Args.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
  }

  static override description =
    'Show one stored conversation (beta; requires chats:read).'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChatGet)
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Message history',
    })
    const response = await client.chats.get(flags.session, args.conversation)
    const chat = response.data.data
    this.writeValue(
      {data: chat, metadata: response.metadata},
      renderChats([chat]),
      flags,
    )
  }
}
