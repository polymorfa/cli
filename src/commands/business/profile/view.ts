import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderBusinessProfile,
  viewOwnBusinessProfile,
} from '../../../services/business.js'

export default class BusinessProfileView extends BaseCommand {
  static override description =
    "View the connected account's own business profile."

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessProfileView)
    const result = await viewOwnBusinessProfile(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.session,
    )
    this.writeValue(result, renderBusinessProfile(result.data), flags)
  }
}
