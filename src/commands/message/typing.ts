import {Flags} from '@oclif/core'
import {conversationReference} from '../../services/conversation.js'

import {BaseCommand} from '../../base-command.js'
import {setMessageTyping} from '../../services/messages.js'

const states = ['typing', 'recording', 'paused'] as const

export default class MessageTyping extends BaseCommand {
  static override description = 'Set the typing state for a chat.'

  static override flags = {
    chat: Flags.string({
      description: 'Conversation ID, E.164 phone number, or BSUID.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this typing update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    state: Flags.option({
      description: 'Typing state.',
      options: [...states],
      required: true,
    })(),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageTyping)
    const result = await setMessageTyping(
      await this.messagingClient(flags),
      flags.session,
      {conversation: conversationReference(flags.chat), state: flags.state},
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Set ${flags.chat} typing state to ${flags.state}.`,
      flags,
    )
  }
}
