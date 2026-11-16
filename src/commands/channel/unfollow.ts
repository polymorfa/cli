import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {unfollowChannel} from '../../services/channels.js'

export default class ChannelUnfollow extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description = 'Unfollow a channel.'

  static override flags = {
    'idempotency-key': Flags.string({description: 'Safely identify retries.'}),
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelUnfollow)
    const result = await unfollowChannel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.connection,
      args.channel,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Unfollowed channel ${args.channel}.`, flags)
  }
}
