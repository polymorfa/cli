import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {replaceChatLabels} from '../../../services/labels.js'

export default class LabelChatReplace extends BaseCommand {
  static override args = {
    chat: Args.string({
      description: 'Polymorfa conversation ID.',
      required: true,
    }),
  }

  static override description = "Replace a chat's complete label set."

  static override flags = {
    clear: Flags.boolean({
      description: 'Detach every label from the chat.',
      exclusive: ['label'],
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this replacement.',
    }),
    label: Flags.string({
      description: 'Label ID. Repeat to assign multiple labels.',
      exclusive: ['clear'],
      multiple: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LabelChatReplace)
    const result = await replaceChatLabels(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Label'}),
      flags.session,
      args.chat,
      flags.label,
      flags.clear,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      flags.clear
        ? `Cleared every label from ${args.chat}.`
        : `Replaced labels for ${args.chat}.`,
      flags,
    )
  }
}
