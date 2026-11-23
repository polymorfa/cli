import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {listChannels, renderChannels} from '../../services/channels.js'

export default class ChannelList extends BaseCommand {
  static override description = 'List channels for a connected connection.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ChannelList)
    const result = await listChannels(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.connection,
    )
    this.writeValue(result, renderChannels(result.data), flags)
  }
}
