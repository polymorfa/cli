import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderProfile, viewProfile} from '../../services/profile.js'

export default class ProfileView extends BaseCommand {
  static override description = 'View the connected account profile.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileView)
    const result = await viewProfile(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Profile'}),
      flags.session,
    )
    this.writeValue(result, renderProfile(result.data), flags)
  }
}
