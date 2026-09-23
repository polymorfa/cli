import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderMessages} from '../../services/history.js'

export default class MessageGet extends BaseCommand {
  static override args = {
    message: Args.string({description: 'Message ID.', required: true}),
  }

  static override description =
    'Show one stored message (beta; requires messages:read).'

  static override flags = {
    conversation: Flags.string({
      description: 'Conversation ID or E.164 phone number.',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageGet)
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Message history',
    })
    const response = await client.chats.retrieveMessage(
      flags.session,
      flags.conversation,
      args.message,
    )
    const message = response.data.data
    this.writeValue(
      {data: message, metadata: response.metadata},
      renderMessages([message]),
      flags,
    )
  }
}
