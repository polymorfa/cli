import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {renderJson, viewBusinessCompliance} from '../../../services/business.js'

export default class BusinessComplianceView extends BaseCommand {
  static override description = 'View complete business merchant compliance.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessComplianceView)
    const result = await viewBusinessCompliance(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
    )
    this.writeValue(result, renderJson(result.data), flags)
  }
}
