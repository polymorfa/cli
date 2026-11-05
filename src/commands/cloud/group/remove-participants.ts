import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'

export default class CloudGroupRemoveParticipants extends BaseCommand {
  static override description =
    'Remove up to eight participants from an Official group (beta). A removed participant cannot rejoin with the invite link. Requires groups:manage. Sends once.'
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
    participant: Flags.string({
      description:
        'Conversation ID or E.164 phone number. Repeat up to eight times.',
      required: true,
      multiple: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupRemoveParticipants)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.removeParticipants(
      flags.session,
      args.group,
      flags.participant,
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
