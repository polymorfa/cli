import {BaseCommand} from '../../base-command.js'
import {createAuthService} from '../../config/auth-service.js'

export default class AuthLogout extends BaseCommand {
  static override description =
    'Remove a profile and its operating-system keyring credential.'

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogout)
    const result = await createAuthService().logout(flags.profile)
    this.writeValue(result, `Logged out profile ${result.name}.`, flags)
  }
}
