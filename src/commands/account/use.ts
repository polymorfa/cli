import {Args} from '@oclif/core'

import {AccountDeviceCommand} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountUse extends AccountDeviceCommand {
  static override description =
    'Select a local account-device profile without changing the active machine profile or its authority.'
  static override args = {name: Args.string({required: true})}
  async run(): Promise<void> {
    const {args, flags} = await this.parse(AccountUse)
    await this.accountOperation(flags, () =>
      createAccountDeviceAuthService().use(args.name),
    )
    this.accountResult(
      {profile: args.name, active: true, kind: 'accountDevice'},
      flags,
    )
  }
}
