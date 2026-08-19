import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {setProfileStatus} from '../../../services/profile.js'

export default class ProfileStatusSet extends BaseCommand {
  static override description = 'Set the connected account profile status.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this status update.',
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    status: Flags.string({
      description: 'Complete profile status.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileStatusSet)
    const result = await setProfileStatus(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Profile'}),
      flags.session,
      flags.status,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, 'Updated profile status.', flags)
  }
}
