import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {ringCallParticipant} from '../../services/calls.js'

export default class CallsRing extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
    target: Args.string({
      description:
        'E.164 phone number or public user ID already in the call roster.',
      required: true,
    }),
  }
  static override description =
    'Ring a non-connected WhatsApp participant already in the call roster. Re-ring applies the same destination permissions and restrictions as an invitation. It does not add a participant or mark them connected.'
  static override examples = ['<%= config.bin %> calls ring call_123 +15550100']
  static override summary = 'Ring an existing call participant again.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsRing)
    const result = await ringCallParticipant(
      createMessagingClient(await this.messagingEnvironment(flags)),
      args.callId,
      args.target,
    )
    this.writeValue(result, `Ring requested for call ${args.callId}.`, flags)
  }
}
