import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {endCall} from '../../services/calls.js'

export default class CallsEnd extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
  }

  static override description =
    'End a call for every participant and close every connection. Repeating the command succeeds.'

  static override examples = ['<%= config.bin %> calls end call_123']

  static override summary = 'End a call for everyone.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsEnd)
    const result = await endCall(
      createMessagingClient(await this.messagingEnvironment(flags)),
      args.callId,
    )
    this.writeValue(result, `Ended call ${args.callId}.`, flags)
  }
}
