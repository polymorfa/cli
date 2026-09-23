import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {idempotencyKey} from '../../../input/idempotency.js'
import {reactToChannelMessage} from '../../../services/channels.js'

export default class ChannelMessageReact extends BaseCommand {
  static override args = {
    channel: Args.string({description: 'Channel ID.', required: true}),
    'message-id': Args.string({
      description: 'Polymorfa message ID.',
      required: true,
    }),
  }

  static override description =
    'Set a channel message reaction; pass an empty value to remove it.'

  static override flags = {
    'idempotency-key': Flags.string({
      description:
        'Key that makes retries of this write safe for 24 hours. Generated when omitted.',
    }),
    reaction: Flags.string({
      description: 'Reaction text, at most 32 UTF-8 bytes; empty removes it.',
      required: true,
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelMessageReact)
    const result = await reactToChannelMessage(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Channel'}),
      flags.session,
      args.channel,
      args['message-id'],
      flags.reaction,
      {idempotencyKey: idempotencyKey(flags['idempotency-key'])},
    )
    this.writeValue(
      result,
      flags.reaction.length === 0
        ? `Removed the reaction from channel message ${args['message-id']}.`
        : `Reacted to channel message ${args['message-id']}.`,
      flags,
    )
  }
}
