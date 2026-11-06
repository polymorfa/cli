import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

export default class CloudGroupDelete extends BaseCommand {
  static override description =
    'Delete an Official group and remove every participant, including your business (beta). Requires groups:manage. Does not retry an uncertain write.'
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
    yes: Flags.boolean({
      description: 'Confirm deleting the group for every participant.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupDelete)
    if (!flags.yes)
      throw new PolymorfaConfigurationError(
        'Pass --yes to delete the group.',
        'yes',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.delete(
      flags.session,
      args.group,
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
