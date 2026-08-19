import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  listChannelMessages,
  renderChannelMessages,
} from '../../../services/channels.js'

export default class ChannelMessageList extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description = 'List a bounded page of channel messages.'

  static override flags = {
    before: Flags.integer({
      description: 'Return messages older than this positive server ID.',
      min: 1,
    }),
    limit: Flags.integer({
      description: 'Number of messages to return (default 50).',
      max: 100,
      min: 1,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelMessageList)
    const result = await listChannelMessages(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      {
        ...(flags.limit === undefined ? {} : {count: flags.limit}),
        ...(flags.before === undefined ? {} : {before: flags.before}),
      },
    )
    this.writeValue(result, renderChannelMessages(result.data), flags)
  }
}
