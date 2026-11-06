import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {setCallHand} from '../../services/calls.js'

export default class CallsHand extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
  }

  static override description =
    'Raise or lower the Number’s hand. The Number has one hand state shared across its application connections.'

  static override examples = [
    '<%= config.bin %> calls hand call_123 --connection-id conn_0123456789 --raised',
  ]

  static override flags = {
    'connection-id': Flags.string({
      description:
        'Connection to close: 8 to 64 letters, digits, underscores, or hyphens.',
      required: true,
    }),
    raised: Flags.boolean({description: 'Raise the hand; omit to lower it.'}),
    participant: Flags.string({
      description:
        'Server API keys only: participant that owns the connection (default "default").',
    }),
  }

  static override summary = 'Raise or lower a call hand.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsHand)
    const environment = await this.messagingEnvironment(flags)
    const result = await setCallHand(
      createMessagingClient(environment),
      environment.credential,
      args.callId,
      {
        connectionId: flags['connection-id'],
        raised: flags.raised,
        participant: flags.participant,
      },
    )
    this.writeValue(result, `Updated hand on call ${args.callId}.`, flags)
  }
}
