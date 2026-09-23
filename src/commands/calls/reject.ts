import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {declineCall} from '../../services/calls.js'

export default class CallsReject extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
  }

  static override description =
    'Decline a ringing call through the unified Calls API. Declining ends the call for every participant. Exits with code 4 when the call is no longer ringing (call_not_ringing). To reject a call through the Linked Device session route with the caller ID, use call reject.'

  static override examples = [
    '<%= config.bin %> calls reject call_123',
    '<%= config.bin %> calls reject call_123 --participant agent-7 --json',
  ]

  static override flags = {
    participant: Flags.string({
      description:
        'Server API keys only: participant that declines (default "default").',
    }),
  }

  static override summary = 'Decline a ringing call.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsReject)
    const environment = await this.messagingEnvironment(flags)
    const result = await declineCall(
      createMessagingClient(environment),
      environment.credential,
      args.callId,
      {participant: flags.participant},
    )
    this.writeValue(result, `Declined call ${args.callId}.`, flags)
  }
}
