import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'
import {readJsonInput} from '../../../api/request.js'
import {parseCloudTemplate, requestKey} from '../../../services/cloud.js'

export default class CloudTemplateCreate extends BaseCommand {
  static override description =
    'Submit one Meta template (beta). Requires messages:write. Sends once; pass --idempotency-key so a manual retry cannot submit twice.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
    input: Flags.string({
      description:
        'Template JSON file or - for stdin: name, language, category, components.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Key that fences a manual retry: reuse it after a lost response and the API returns the original response instead of writing again.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudTemplateCreate)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const body = parseCloudTemplate(await readJsonInput(flags.input))
    const response = await client.cloudTemplates.create(
      flags.session,
      body,
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
