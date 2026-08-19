import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {unmuteChannel} from '../../services/channels.js'

export default class ChannelUnmute extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description = 'Unmute a channel.'

  static override flags = {
    'idempotency-key': Flags.string({description: 'Safely identify retries.'}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelUnmute)
    const result = await unmuteChannel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, `Unmuted channel ${args.channel}.`, flags)
  }
}
