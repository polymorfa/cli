import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {renderJson, viewBusinessCompliance} from '../../../services/business.js'

export default class BusinessComplianceView extends BaseCommand {
  static override description = 'View complete business merchant compliance.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessComplianceView)
    const result = await viewBusinessCompliance(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.connection,
    )
    this.writeValue(result, renderJson(result.data), flags)
  }
}
