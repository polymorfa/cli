import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {markChannelMessageViewed} from '../../../services/channels.js'

export default class ChannelMessageMarkViewed extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
    'message-id': Args.string({
      description: 'Polymorfa message ID.',
      required: true,
    }),
  }

  static override description = 'Mark a channel message as viewed.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this viewed action.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelMessageMarkViewed)
    const result = await markChannelMessageViewed(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      args['message-id'],
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Marked channel message ${args['message-id']} as viewed.`,
      flags,
    )
  }
}
