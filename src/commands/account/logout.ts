import {AccountDeviceCommand} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountLogout extends AccountDeviceCommand {
  static override description =
    'Revoke only the selected account session and report remote revocation separately from local cleanup.'
  async run(): Promise<void> {
    const {flags} = await this.parse(AccountLogout)
    const result = await this.accountOperation(flags, (signal) =>
      createAccountDeviceAuthService().logout(flags.profile, signal),
    )
    this.accountResult(result, flags)
    if (
      result.remoteRevocation !== 'confirmed' ||
      !result.localMetadataRemoved ||
      !result.localCredentialRemoved
    )
      this.exit(1)
  }
}
