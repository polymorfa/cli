import {Flags} from '@oclif/core'
import type {SendTextMessageRequest} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {idempotencyKey} from '../../../input/idempotency.js'
import {sendTextMessage} from '../../../services/messages.js'
import {conversationReference} from '../../../services/conversation.js'

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
      description:
        'Key that makes retries of this write safe for 24 hours. Generated when omitted.',
    }),
    mention: Flags.string({
      description:
        'Mention a Polymorfa user ID. Repeat for multiple recipients.',
      multiple: true,
    }),
    'reply-to': Flags.string({
      description: 'Polymorfa message ID to quote in the reply.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    to: Flags.string({
      description: 'Conversation ID, E.164 phone number, or BSUID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendText)
    const request: SendTextMessageRequest = {
      conversation: conversationReference(flags.to),
      content: {text: flags.body},
      ...(flags.forwarded ? {isForwarded: true} : {}),
      ...(flags.mention === undefined ? {} : {mentions: flags.mention}),
      ...(flags['reply-to'] === undefined
        ? {}
        : {
            quotedMessage: {
              id: flags['reply-to'],
            },
          }),
    }
    const result = await sendTextMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(
      result,
      `Sent message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
