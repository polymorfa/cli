import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  renderJson,
  viewBusinessLinkedAccounts,
} from '../../../services/business.js'

export default class BusinessAccountsView extends BaseCommand {
  static override description =
    'View linked business accounts and ad identities.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BusinessAccountsView)
    const result = await viewBusinessLinkedAccounts(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Business App'}),
      flags.connection,
    )
    this.writeValue(result, renderJson(result.data), flags)
  }
}
