import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {deleteProfilePicture} from '../../../services/profile.js'

export default class ProfilePictureDelete extends BaseCommand {
  static override description = 'Delete the connected account profile picture.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this picture deletion.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm permanent profile-picture deletion.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfilePictureDelete)
    const result = await deleteProfilePicture(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Profile'}),
      flags.session,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, 'Deleted profile picture.', flags)
  }
}
