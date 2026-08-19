import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {subscribeToChannelLiveUpdates} from '../../../services/channels.js'

export default class ChannelLiveUpdatesSubscribe extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description =
    'Start or renew a temporary upstream channel-update subscription.'

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
    const {args, flags} = await this.parse(ChannelLiveUpdatesSubscribe)
    const result = await subscribeToChannelLiveUpdates(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    const human =
      'durationSeconds' in result.data
        ? `Subscribed to channel updates for ${result.data.durationSeconds} seconds. Repeat this command to renew.`
        : `Accepted the channel-update subscription as request ${result.data.requestId}.`
    this.writeValue(result, human, flags)
  }
}
