import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderPrivacy, viewPrivacy} from '../../services/privacy.js'

export default class PrivacyView extends BaseCommand {
  static override description = 'View account-level Messaging privacy settings.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PrivacyView)
    const result = await viewPrivacy(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Privacy'}),
      flags.session,
    )
    this.writeValue(result, renderPrivacy(result.data), flags)
  }
}
