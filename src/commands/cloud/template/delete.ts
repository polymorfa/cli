import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

export default class CloudTemplateDelete extends BaseCommand {
  static override description =
    'Delete every language of a Meta template name (beta). Requires messages:write. Does not retry an uncertain write.'
  static override args = {
    name: Args.string({
      description: 'Meta template name to delete in all languages.',
      required: true,
    }),
  }
  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm deletion of all language variants.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after an unknown outcome and the API returns idempotency_completed instead of writing again.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudTemplateDelete)
    if (!flags.yes)
      throw new PolymorfaConfigurationError(
        'Pass --yes to delete every language of this template.',
        'yes',
      )
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.cloudTemplates.delete(
      flags.session,
      args.name,
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
