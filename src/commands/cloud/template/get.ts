import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'

export default class CloudTemplateGet extends BaseCommand {
  static override description =
    'Read a Meta template by name and language (beta). Omitted language defaults to en_US; requires messages:write.'
  static override args = {
    name: Args.string({description: 'Meta template name.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    language: Flags.string({
      description: 'Template language; defaults to en_US at the API.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudTemplateGet)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.cloudTemplates.retrieve(
      flags.session,
      args.name,
      flags.language === undefined ? {} : {language: flags.language},
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
