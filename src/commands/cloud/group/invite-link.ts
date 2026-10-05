import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

export default class CloudGroupInviteLink extends BaseCommand {
  static override description =
    'Show an Official group invite link, or create a new one with --reset (beta). Resetting stops every earlier link. Requires groups:read, or groups:manage with --reset.'
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
    reset: Flags.boolean({
      description:
        'Create a new link; every earlier link stops working. Sends once.',
      default: false,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupInviteLink)
    if (!flags.reset && flags['idempotency-key'] !== undefined)
      throw new PolymorfaConfigurationError(
        '--idempotency-key applies only with --reset.',
        'idempotency-key',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = flags.reset
      ? await client.officialGroups.resetInviteLink(
          flags.session,
          args.group,
          requestKey(flags['idempotency-key']),
        )
      : await client.officialGroups.getInviteLink(flags.session, args.group)
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
