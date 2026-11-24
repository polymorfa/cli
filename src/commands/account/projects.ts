import {Flags} from '@oclif/core'

import {AccountDeviceCommand} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountProjects extends AccountDeviceCommand {
  static override description =
    'Read one page of projects in a currently allowed team; this grants no command or messaging access.'
  static override flags = {
    team: Flags.string({
      required: true,
      description: 'Team UUID returned by account teams.',
    }),
    after: Flags.string({description: 'Continue after this project UUID.'}),
    limit: Flags.integer({
      min: 1,
      max: 100,
      description: 'Page size, up to 100.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(AccountProjects)
    const result = await this.accountOperation(flags, (signal) =>
      createAccountDeviceAuthService().projects(
        flags.team,
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
