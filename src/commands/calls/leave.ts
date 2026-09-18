import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {leaveCall} from '../../services/calls.js'

export default class CallsLeave extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
  }

  static override description =
    'Close one media connection. The call and the participant’s other connections continue. Use calls end to end the call for everyone.'

  static override examples = [
    '<%= config.bin %> calls leave call_123 --connection-id conn_0123456789',
  ]

  static override flags = {
    'connection-id': Flags.string({
      description:
        'Connection to close: 8 to 64 letters, digits, underscores, or hyphens.',
      required: true,
    }),
    participant: Flags.string({
      description:
        'Server API keys only: participant that owns the connection (default "default").',
    }),
  }

  static override summary = 'Close one call connection.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsLeave)
    const environment = await this.messagingEnvironment(flags)
    const result = await leaveCall(
      createMessagingClient(environment),
      environment.credential,
      args.callId,
      {
        connectionId: flags['connection-id'],
        participant: flags.participant,
      },
    )
    this.writeValue(
      result,
      `Closed connection ${flags['connection-id']} on call ${args.callId}.`,
      flags,
    )
  }
}
