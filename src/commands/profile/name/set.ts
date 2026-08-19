import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {setProfileName} from '../../../services/profile.js'

export default class ProfileNameSet extends BaseCommand {
  static override description = 'Set the connected account profile name.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this name update.',
    }),
    name: Flags.string({description: 'Complete profile name.', required: true}),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileNameSet)
    const result = await setProfileName(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Profile'}),
      flags.session,
      flags.name,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, 'Updated profile name.', flags)
  }
}
