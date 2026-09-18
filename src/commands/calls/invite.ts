import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {inviteToCall, renderCallParticipant} from '../../services/calls.js'

export default class CallsInvite extends BaseCommand {
  static override args = {
    callId: Args.string({description: 'Call ID.', required: true}),
    target: Args.string({
      description: 'Phone number in E.164 form or a numeric WhatsApp user ID.',
      required: true,
    }),
  }

  static override description =
    'Ring another WhatsApp user into a call, turning a 1:1 call into a group call. The call must have a live leg.'

  static override examples = [
    '<%= config.bin %> calls invite call_123 +15550101',
  ]

  static override summary = 'Invite a participant into a call.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsInvite)
    const result = await inviteToCall(
      createMessagingClient(await this.messagingEnvironment(flags)),
      args.callId,
      args.target,
    )
    this.writeValue(result, renderCallParticipant(result.data), flags)
  }
}
