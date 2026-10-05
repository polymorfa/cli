import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

export default class CloudGroupUpdate extends BaseCommand {
  static override description =
    'Change an Official group subject or description (beta). Requires groups:manage. Sends once; a group.update event reports what WhatsApp applied.'
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
    subject: Flags.string({description: 'New subject, 1 to 128 characters.'}),
    description: Flags.string({
      description: 'New description, at most 2048 characters.',
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API answers instead of changing the group again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupUpdate)
    if (flags.subject === undefined && flags.description === undefined)
      throw new PolymorfaConfigurationError(
        'Pass --subject or --description.',
        'subject',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.update(
      flags.session,
      args.group,
      {
        ...(flags.subject === undefined ? {} : {subject: flags.subject}),
        ...(flags.description === undefined
          ? {}
          : {description: flags.description}),
      },
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
