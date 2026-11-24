import {Args, Flags} from '@oclif/core'
import {conversationReference} from '../../services/conversation.js'

import {BaseCommand} from '../../base-command.js'
import {markMessageSeen} from '../../services/messages.js'

export default class MessageMarkSeen extends BaseCommand {
  static override args = {
    message: Args.string({description: 'Message ID.', required: true}),
  }

  static override description = 'Mark a message as seen.'

  static override flags = {
    chat: Flags.string({
      description: 'Conversation ID, E.164 phone number, or BSUID.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this seen receipt.',
    }),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageMarkSeen)
    const result = await markMessageSeen(
      await this.messagingClient(flags),
      flags.connection,
      {conversation: conversationReference(flags.chat), id: args.message},
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Marked message ${args.message} as seen.`, flags)
  }
}
