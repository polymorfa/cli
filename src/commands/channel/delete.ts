import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {deleteChannel} from '../../services/channels.js'

export default class ChannelDelete extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
  }

  static override description = 'Delete a channel.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this channel deletion.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent channel deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelDelete)
    const result = await deleteChannel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    const human =
      'requestId' in result.data
        ? `Accepted channel deletion as request ${result.data.requestId}.`
        : `Deleted channel ${args.channel}.`
    this.writeValue(result, human, flags)
  }
}
