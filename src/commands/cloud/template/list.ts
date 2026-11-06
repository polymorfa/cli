import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult} from '../../../services/cloud.js'

export default class CloudTemplateList extends BaseCommand {
  static override description =
    'List the refreshed Meta template catalog for an Official API Number (beta). Requires messages:write.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging Number ID.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(CloudTemplateList)

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.cloudTemplates.list(flags.session)
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
