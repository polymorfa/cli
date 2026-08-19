import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createAuthService} from '../../config/auth-service.js'

export default class AuthUse extends BaseCommand {
  static override args = {
    profile: Args.string({description: 'Profile name.', required: true}),
  }

  static override description = 'Select the active authentication profile.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(AuthUse)
    const result = await createAuthService().use(args.profile)
    this.writeValue(result, `Active profile: ${result.name}`, flags)
  }
}
