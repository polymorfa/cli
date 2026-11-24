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
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessProfileView)
    const result = await viewOwnBusinessProfile(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.connection,
    )
    this.writeValue(result, renderBusinessProfile(result.data), flags)
  }
}
