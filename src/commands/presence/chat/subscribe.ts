import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {subscribeToChatPresence} from '../../../services/presence.js'

export default class PresenceChatSubscribe extends BaseCommand {
  static override args = {
    chat: Args.string({description: 'Polymorfa user ID.', required: true}),
  }

  static override description =
    'Subscribe to or renew retained presence observations for a chat.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this subscription request.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PresenceChatSubscribe)
    const result = await subscribeToChatPresence(
      await this.messagingClient(flags),
      flags.session,
      args.chat,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    const human =
      'expiresAt' in result.data
        ? `Subscribed to ${args.chat} presence until ${result.data.expiresAt}. Repeat this command to renew.`
        : `Accepted presence subscription for ${args.chat} as request ${result.data.requestId}.`
    this.writeValue(result, human, flags)
  }
}
