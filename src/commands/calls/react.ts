import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {reactToCall} from '../../services/calls.js'

export default class CallsReact extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
  }

  static override description =
    'Send a transient call reaction, or clear it. The connection must belong to the acting participant.'

  static override examples = [
    '<%= config.bin %> calls react call_123 --connection-id conn_0123456789 --emoji 👍',
  ]

  static override flags = {
    'connection-id': Flags.string({
      description:
        'Connection to close: 8 to 64 letters, digits, underscores, or hyphens.',
      required: true,
    }),
    emoji: Flags.string({
      description: 'Reaction emoji; omit with --clear.',
      exclusive: ['clear'],
    }),
    clear: Flags.boolean({description: 'Clear the previous reaction.'}),
    participant: Flags.string({
      description:
        'Server API keys only: participant that owns the connection (default "default").',
    }),
  }

  static override summary = 'Send or clear a call reaction.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsReact)
    if (!flags.clear && flags.emoji === undefined)
      this.error('Use --emoji or --clear.')
    const environment = await this.messagingEnvironment(flags)
    const result = await reactToCall(
      createMessagingClient(environment),
      environment.credential,
      args.callId,
      {
        connectionId: flags['connection-id'],
        emoji: flags.clear ? '' : (flags.emoji ?? ''),
        participant: flags.participant,
      },
    )
    this.writeValue(result, `Sent reaction on call ${args.callId}.`, flags)
  }
}
