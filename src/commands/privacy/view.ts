import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderPrivacy, viewPrivacy} from '../../services/privacy.js'

export default class PrivacyView extends BaseCommand {
  static override description = 'View account-level Messaging privacy settings.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PrivacyView)
    const result = await viewPrivacy(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Privacy'}),
      flags.connection,
    )
    this.writeValue(result, renderPrivacy(result.data), flags)
  }
}
