import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderChatPresence,
  viewChatPresence,
} from '../../../services/presence.js'

export default class PresenceChatView extends BaseCommand {
  static override args = {
    chat: Args.string({
      description: 'Chat, user, or group JID.',
      required: true,
    }),
  }

  static override description =
    'View retained, policy-governed presence observations for a chat.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PresenceChatView)
    const result = await viewChatPresence(
      await this.messagingClient(flags),
      flags.session,
      args.chat,
    )
    this.writeValue(result, renderChatPresence(result.data), flags)
  }
}
