import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderChannel, viewChannel} from '../../services/channels.js'

export default class ChannelView extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description = 'View one channel.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelView)
    const result = await viewChannel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
    )
    this.writeValue(result, renderChannel(result.data), flags)
  }
}
