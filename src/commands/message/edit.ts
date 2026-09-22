import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  idempotencyOptions,
  transportFlag,
  messageTransport,
} from '../../input/message-send.js'
import {editMessage} from '../../services/messages.js'

export default class MessageEdit extends BaseCommand {
  static override args = {
    message: Args.string({description: 'Message ID.', required: true}),
  }

  static override description = 'Replace the text of a message you sent.'

  static override examples = [
    '<%= config.bin %> message edit 740000000001 --session session_123 --chat 730000000001 --body "Corrected text"',
  ]

  static override flags = {
    transport: transportFlag,
    body: Flags.string({description: 'Replacement text.', required: true}),
    chat: Flags.string({
      description: 'Conversation that contains the message.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this edit.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageEdit)
    const result = await editMessage(
      await this.messagingClient(flags),
      flags.session,
      flags.chat,
      args.message,
      flags.body,
      {
        ...idempotencyOptions(flags['idempotency-key']),
        ...(flags.transport === undefined
          ? {}
          : {transport: messageTransport(flags.transport)}),
      },
    )
    this.writeValue(result, `Edited message ${args.message}.`, flags)
  }
}
