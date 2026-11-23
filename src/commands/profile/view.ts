import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {renderProfile, viewProfile} from '../../services/profile.js'

export default class ProfileView extends BaseCommand {
  static override description = 'View the connected account profile.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileView)
    const result = await viewProfile(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Profile'}),
      flags.connection,
    )
    this.writeValue(result, renderProfile(result.data), flags)
  }
}
