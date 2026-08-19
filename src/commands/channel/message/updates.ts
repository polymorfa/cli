import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listChannelMessageUpdates,
  renderChannelMessages,
} from '../../../services/channels.js'

export default class ChannelMessageUpdates extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description =
    'List a bounded page of channel message updates.'

  static override flags = {
    after: Flags.integer({
      description: 'Return updates after this positive message server ID.',
      min: 1,
    }),
    limit: Flags.integer({
      description: 'Number of updates to return (default 50).',
      max: 100,
      min: 1,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    since: Flags.integer({
      description:
        'Return updates since this Unix timestamp in seconds; 0 is treated as unset.',
      min: 0,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelMessageUpdates)
    const result = await listChannelMessageUpdates(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      {
        ...(flags.limit === undefined ? {} : {count: flags.limit}),
        ...(flags.since === undefined ? {} : {since: flags.since}),
        ...(flags.after === undefined ? {} : {after: flags.after}),
      },
    )
    this.writeValue(result, renderChannelMessages(result.data), flags)
  }
}
