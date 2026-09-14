import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderUserSecurityCode,
  viewUserSecurityCode,
} from '../../services/session-identities.js'

export default class UserSecurityCode extends BaseCommand {
  static override args = {
    user: Args.string({
      description: 'Decimal Polymorfa user ID.',
      required: true,
    }),
  }

  static override description = 'View a user identity verification code.'

  static override flags = {
    session: Flags.string({
      description: 'Messaging session ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(UserSecurityCode)
    const result = await viewUserSecurityCode(
      await this.messagingClient(flags, {serverApiKeyOnly: 'User'}),
      flags.session,
      args.user,
    )
    this.writeValue(result, renderUserSecurityCode(result.data), flags)
  }
}
