import {Flags} from '@oclif/core'

import {AccountDeviceCommand} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountTeams extends AccountDeviceCommand {
  static override description =
    'Read one page of teams currently allowed to the selected account session.'
  static override flags = {
    after: Flags.string({description: 'Continue after this team UUID.'}),
    limit: Flags.integer({
      min: 1,
      max: 100,
      description: 'Page size, up to 100.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(AccountTeams)
    const result = await this.accountOperation(flags, (signal) =>
      createAccountDeviceAuthService().teams(
        flags.profile,
        {
          ...(flags.after === undefined ? {} : {after: flags.after}),
          ...(flags.limit === undefined ? {} : {limit: flags.limit}),
        },
        signal,
      ),
    )
    this.accountResult(result, flags)
  }
}
