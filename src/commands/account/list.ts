import {AccountDeviceCommand} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountList extends AccountDeviceCommand {
  static override description =
    'List local account-device profile metadata without reading credentials or making requests.'
  async run(): Promise<void> {
    const {flags} = await this.parse(AccountList)
    this.accountResult(
      await this.accountOperation(flags, () =>
        createAccountDeviceAuthService().list(),
      ),
      flags,
    )
  }
}
