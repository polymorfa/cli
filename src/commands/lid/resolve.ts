import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderResolvedLid,
  resolveLid,
} from '../../services/session-identities.js'

const IDENTITY_FLAGS = ['phone-number', 'id', 'lid', 'username']

export default class LidResolve extends BaseCommand {
  static override description = 'Resolve one phone number, LID, or username.'

  static override flags = {
    id: Flags.string({
      description: 'Stable user ID in digits@lid form.',
      exclusive: IDENTITY_FLAGS.filter((name) => name !== 'id'),
    }),
    lid: Flags.string({
      description: 'Deprecated alias for --id.',
      exclusive: IDENTITY_FLAGS.filter((name) => name !== 'lid'),
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
    const {flags} = await this.parse(LidResolve)
    const result = await resolveLid(
      await this.messagingClient(flags, {serverApiKeyOnly: 'LID'}),
      flags.session,
      {
        ...(flags.id === undefined ? {} : {id: flags.id}),
        ...(flags.lid === undefined ? {} : {lid: flags.lid}),
        ...(flags['phone-number'] === undefined
          ? {}
          : {phoneNumber: flags['phone-number']}),
        ...(flags.username === undefined ? {} : {username: flags.username}),
        ...(flags['username-key'] === undefined
          ? {}
          : {usernameKey: flags['username-key']}),
      },
    )
    this.writeValue(result, renderResolvedLid(result.data), flags)
  }
}
