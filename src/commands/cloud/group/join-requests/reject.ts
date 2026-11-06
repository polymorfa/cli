import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../../base-command.js'
import {cloudResult, requestKey} from '../../../../services/cloud.js'

export default class CloudGroupJoinRequestsReject extends BaseCommand {
  static override description =
    'Reject open join requests for an Official group (beta). Requires groups:manage. Sends once; requests WhatsApp could not reject are listed in failed.'
  static override args = {
    group: Args.string({
      description: 'Conversation ID of the group.',
      required: true,
    }),
  }
  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    request: Flags.string({
      description: 'Join request ID. Repeat for several.',
      required: true,
      multiple: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupJoinRequestsReject)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.rejectJoinRequests(
      flags.session,
      args.group,
      flags.request,
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
