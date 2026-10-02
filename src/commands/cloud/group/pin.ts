import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

export default class CloudGroupPin extends BaseCommand {
  static override description =
    'Pin an Official group message for 1 to 30 days, or unpin it with --unpin (beta). At most three messages stay pinned. Requires groups:manage. Sends once.'
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
    message: Flags.string({
      description: 'ID of a message in this group.',
      required: true,
    }),
    days: Flags.integer({
      description: 'Pin duration, 1 to 30 days.',
      min: 1,
      max: 30,
      exclusive: ['unpin'],
    }),
    unpin: Flags.boolean({description: 'Unpin the message.', default: false}),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupPin)
    if (!flags.unpin && flags.days === undefined)
      throw new PolymorfaConfigurationError(
        'Pass --days to pin, or --unpin.',
        'days',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.pin(
      flags.session,
      args.group,
      flags.unpin
        ? {operation: 'unpin', messageId: flags.message}
        : {
            operation: 'pin',
            messageId: flags.message,
            expirationDays: flags.days!,
          },
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
