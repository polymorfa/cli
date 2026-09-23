import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {confirmDangerous} from '../../input/confirmation.js'
import {
  idempotencyOptions,
  transportFlag,
  messageTransport,
} from '../../input/message-send.js'
import {deleteMessage} from '../../services/messages.js'

export default class MessageDelete extends BaseCommand {
  static override args = {
    message: Args.string({description: 'Message ID.', required: true}),
  }

  static override description =
    'Delete a message you sent for everyone in the conversation.'

  static override examples = [
    '<%= config.bin %> message delete 740000000001 --session session_123 --chat 730000000001 --yes',
  ]

  static override flags = {
    transport: transportFlag,
    chat: Flags.string({
      description: 'Conversation that contains the message.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Idempotency-Key header. Generated per invocation when omitted; reuse an explicit key across process retries (24-hour retention).',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm deletion without an interactive prompt.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessageDelete)
    await confirmDangerous({
      prompt: `Delete message ${args.message} for everyone?`,
      yes: flags.yes,
    })
    const result = await deleteMessage(
      await this.messagingClient(flags),
      flags.session,
      flags.chat,
      args.message,
      {
        ...idempotencyOptions(flags['idempotency-key']),
        ...(flags.transport === undefined
          ? {}
          : {transport: messageTransport(flags.transport)}),
      },
    )
    this.writeValue(result, `Deleted message ${args.message}.`, flags)
  }
}
