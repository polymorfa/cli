import {Flags} from '@oclif/core'
import type {SendTextMessageRequest} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {sendTextMessage} from '../../../services/messages.js'

export default class MessageSendText extends BaseCommand {
  static override description = 'Send a text message.'

  static override flags = {
    body: Flags.string({
      description: 'Text to send.',
      required: true,
    }),
    forwarded: Flags.boolean({
      description: 'Mark the message as forwarded.',
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this send operation.',
    }),
    mention: Flags.string({
      description: 'Mention a recipient JID. Repeat for multiple recipients.',
      multiple: true,
    }),
    'reply-participant': Flags.string({
      dependsOn: ['reply-to'],
      description: 'Participant JID for the quoted message.',
    }),
    'reply-to': Flags.string({
      dependsOn: ['reply-participant'],
      description: 'Message ID to quote in the reply.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    to: Flags.string({
      description: 'Recipient chat or group JID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendText)
    const request: SendTextMessageRequest = {
      chatId: flags.to,
      text: flags.body,
      type: 'text',
      ...(flags.forwarded ? {isForwarded: true} : {}),
      ...(flags.mention === undefined ? {} : {mentions: flags.mention}),
      ...(flags['reply-to'] === undefined
        ? {}
        : {
            quotedMessage: {
              messageId: flags['reply-to'],
              participant: flags['reply-participant']!,
            },
          }),
    }
    const result = await sendTextMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Sent message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
