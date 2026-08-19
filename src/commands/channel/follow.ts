import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {followChannel} from '../../services/channels.js'

export default class ChannelFollow extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description = 'Follow a channel.'

  static override flags = {
    'idempotency-key': Flags.string({description: 'Safely identify retries.'}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelFollow)
    const result = await followChannel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Followed channel ${args.channel}.`, flags)
  }
}
