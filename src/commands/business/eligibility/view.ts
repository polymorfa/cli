import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessEligibility,
  viewBusinessEligibility,
} from '../../../services/business.js'

export default class BusinessEligibilityView extends BaseCommand {
  static override description = 'View business feature eligibility.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessEligibilityView)
    const result = await viewBusinessEligibility(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
    )
    this.writeValue(result, renderBusinessEligibility(result.data), flags)
  }
}
