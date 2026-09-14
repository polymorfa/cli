import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderResolvedIdentity,
  resolveIdentity,
} from '../../services/session-identities.js'

const IDENTITY_FLAGS = ['phone-number', 'id', 'username']

export default class IdentityResolve extends BaseCommand {
  static override description =
    'Resolve one phone number, user ID, or username.'

  static override flags = {
    id: Flags.string({
      description: 'Opaque Polymorfa user ID.',
      exclusive: IDENTITY_FLAGS.filter((name) => name !== 'id'),
    }),
    'phone-number': Flags.string({
      description: 'Phone digits with an optional leading plus sign.',
      exclusive: IDENTITY_FLAGS.filter((name) => name !== 'phone-number'),
    }),
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
    username: Flags.string({
      description: 'WhatsApp username containing 3 through 35 characters.',
      exclusive: IDENTITY_FLAGS.filter((name) => name !== 'username'),
    }),
    'username-key': Flags.string({
      dependsOn: ['username'],
      description: 'Optional four-digit username resolution key.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(IdentityResolve)
    const result = await resolveIdentity(
      await this.messagingClient(flags, {
        serverApiKeyOnly: 'identity resolution',
      }),
      flags.session,
      {
        ...(flags.id === undefined ? {} : {id: flags.id}),
        ...(flags['phone-number'] === undefined
          ? {}
          : {phoneNumber: flags['phone-number']}),
        ...(flags.username === undefined ? {} : {username: flags.username}),
        ...(flags['username-key'] === undefined
          ? {}
          : {usernameKey: flags['username-key']}),
      },
    )
    this.writeValue(result, renderResolvedIdentity(result.data), flags)
  }
}
