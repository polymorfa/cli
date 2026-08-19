import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {createAuthService} from '../../config/auth-service.js'
import {readSecretFromStdin} from '../../input/stdin.js'

export default class AuthLogin extends BaseCommand {
  static override description =
    'Store an API key in the operating-system keyring.'

  static override flags = {
    'with-api-key': Flags.boolean({
      description: 'Read a Polymorfa API key from standard input.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)
    if (flags['with-api-key'] !== true) {
      throw new PolymorfaConfigurationError(
        'Browser login requires the upcoming CLI device-authorization API. For now, pipe an API key to polymorfa auth login --with-api-key; the key is read only from standard input.',
        'authentication',
      )
    }

    const apiKey = await readSecretFromStdin()
    this.registerSecret(apiKey)
    const result = await createAuthService().login({
      apiKey,
      profile: flags.profile ?? 'default',
    })
    this.writeValue(
      result,
      `Logged in as profile ${result.name}. Credentials are stored in the operating-system keyring.`,
      flags,
    )
  }
}
