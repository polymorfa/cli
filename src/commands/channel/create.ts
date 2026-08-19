import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createChannel, renderChannel} from '../../services/channels.js'

export default class ChannelCreate extends BaseCommand {
  static override description = 'Create a channel.'

  static override flags = {
    description: Flags.string({description: 'Channel description.'}),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this channel creation.',
    }),
    name: Flags.string({description: 'Channel name.', required: true}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ChannelCreate)
    const result = await createChannel(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      {
        name: flags.name,
        ...(flags.description === undefined
          ? {}
          : {description: flags.description}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    const human =
      'requestId' in result.data
        ? `Accepted channel creation as request ${result.data.requestId}.`
        : renderChannel(result.data)
    this.writeValue(result, human, flags)
  }
}
