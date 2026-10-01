import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, parseCloudTemplateEdit} from '../../../services/cloud.js'
import {readJsonInput} from '../../../api/request.js'

export default class CloudTemplateEdit extends BaseCommand {
  static override description =
    'Submit changes to one Meta template language (beta). Requires messages:write. Acceptance does not establish approval.'
  static override args = {
    name: Args.string({description: 'Meta template name.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    language: Flags.string({
      description: 'Template language; API default is en_US.',
    }),
    input: Flags.string({
      description: 'JSON file or - for stdin containing components.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudTemplateEdit)
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const body = parseCloudTemplateEdit(await readJsonInput(flags.input))
    const response = await client.cloudTemplates.update(
      flags.session,
      args.name,
      body,
      flags.language === undefined ? {} : {language: flags.language},
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
