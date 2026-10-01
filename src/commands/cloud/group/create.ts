import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'

export default class CloudGroupCreate extends BaseCommand {
  static override description =
    'Ask WhatsApp to create an Official group (beta). Requires groups:manage, team enrollment and an Official Business Account. Sends once; the group ID and invite link arrive in a group.update event carrying the returned requestId.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    subject: Flags.string({
      description: 'Group subject, 1 to 128 characters.',
      required: true,
    }),
    description: Flags.string({
      description: 'Group description, at most 2048 characters.',
    }),
    'join-approval': Flags.boolean({
      description: 'Require approval for people who open the invite link.',
      default: false,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudGroupCreate)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.create(
      flags.session,
      {
        subject: flags.subject,
        ...(flags.description === undefined
          ? {}
          : {description: flags.description}),
        ...(flags['join-approval'] ? {joinApprovalRequired: true} : {}),
      },
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
