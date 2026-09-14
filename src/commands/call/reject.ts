import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  rejectCall,
  renderCallRejection,
} from '../../services/session-identities.js'

export default class CallReject extends BaseCommand {
  static override args = {
    call: Args.string({description: 'Incoming call ID.', required: true}),
  }

  static override description = 'Reject an incoming Linked Device call.'

  static override flags = {
    from: Flags.string({
      description: 'Incoming caller Polymorfa ID.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this call rejection.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallReject)
    const result = await rejectCall(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Call'}),
      flags.session,
      args.call,
      flags.from,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderCallRejection(result.data), flags)
  }
}
