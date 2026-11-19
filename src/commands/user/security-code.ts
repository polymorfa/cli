import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  renderUserSecurityCode,
  viewUserSecurityCode,
} from '../../services/connection-identities.js'

export default class UserSecurityCode extends BaseCommand {
  static override args = {
    user: Args.string({
      description: 'Decimal Polymorfa user ID.',
      required: true,
    }),
  }

  static override description = 'View a user identity verification code.'

  static override flags = {
    connection: Flags.string({
      description: 'Messaging connection ID.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(UserSecurityCode)
    const result = await viewUserSecurityCode(
      await this.messagingClient(flags, {serverApiKeyOnly: 'User'}),
      flags.connection,
      args.user,
    )
    this.writeValue(result, renderUserSecurityCode(result.data), flags)
  }
}
