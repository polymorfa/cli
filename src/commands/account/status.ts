import {AccountDeviceCommand} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountStatus extends AccountDeviceCommand {
  static override description =
    'Check the selected account session against its pinned API issuer.'
  async run(): Promise<void> {
    const {flags} = await this.parse(AccountStatus)
    const result = await this.accountOperation(flags, (signal) =>
      createAccountDeviceAuthService().status(flags.profile, signal),
    )
    this.accountResult(result, flags)
    if (!result.credentialPresent) this.exit(1)
  }
}
