import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {setProfilePicture} from '../../../services/profile.js'

export default class ProfilePictureSet extends BaseCommand {
  static override description = 'Set the connected account profile picture.'

  static override flags = {
    file: Flags.string({
      description: 'Local picture path. Sent as bounded base64 JSON.',
      exclusive: ['url'],
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this picture update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    url: Flags.string({
      description: 'Remote picture URL fetched by the Messaging service.',
      exclusive: ['file'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfilePictureSet)
    const result = await setProfilePicture(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Profile'}),
      flags.session,
      {
        ...(flags.file === undefined ? {} : {file: flags.file}),
        ...(flags.url === undefined ? {} : {url: flags.url}),
      },
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, 'Updated profile picture.', flags)
  }
}
