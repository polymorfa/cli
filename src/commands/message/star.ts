import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {setMessageStar} from '../../services/messages.js'

export default class MessageStar extends BaseCommand {
  static override args = {
    message: Args.string({description: 'Message ID.', required: true}),
  }

  static override description = 'Star or unstar a message.'

  static override flags = {
    chat: Flags.string({description: 'Chat or group JID.', required: true}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this star update.',
    }),
    remove: Flags.boolean({description: 'Remove the existing star.'}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageStar)
    const result = await setMessageStar(
      await this.messagingClient(flags),
      flags.session,
      {chatId: flags.chat, messageId: args.message, star: !flags.remove},
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `${flags.remove ? 'Unstarred' : 'Starred'} message ${args.message}.`,
      flags,
    )
  }
}
