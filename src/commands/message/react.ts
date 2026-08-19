import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {reactToMessage} from '../../services/messages.js'

export default class MessageReact extends BaseCommand {
  static override args = {
    message: Args.string({description: 'Message ID.', required: true}),
  }

  static override description = 'React to a message.'

  static override flags = {
    chat: Flags.string({description: 'Chat or group JID.', required: true}),
    emoji: Flags.string({description: 'Reaction emoji.', required: true}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this reaction.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageReact)
    const result = await reactToMessage(
      await this.messagingClient(flags),
      flags.session,
      {chatId: flags.chat, messageId: args.message, reaction: flags.emoji},
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Reacted to message ${args.message} in ${flags.chat}.`,
      flags,
    )
  }
}
