import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {createAuthService} from '../../config/auth-service.js'
import {readSecretFromStdin} from '../../input/stdin.js'

export default class AuthLogin extends BaseCommand {
  static override description =
    'Store an organization key or project token in the operating-system keyring.'

  static override flags = {
    'with-api-key': Flags.boolean({
      description: 'Read a Polymorfa API key from standard input.',
    }),
    'with-project-token': Flags.boolean({
      description: 'Read an exact-project token from standard input.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)
    if (flags['with-api-key'] === flags['with-project-token']) {
      throw new PolymorfaConfigurationError(
        'Choose exactly one of --with-api-key or --with-project-token; the credential is read only from standard input.',
        'authentication',
      )
    }
    if (
      flags['with-project-token'] &&
      (flags.project === undefined || flags.project.trim().length === 0)
    ) {
      throw new PolymorfaConfigurationError(
        '--with-project-token requires --project before a credential is read.',
        'project',
      )
    }

    const credential = await readSecretFromStdin()
    this.registerSecret(credential)
    const service = createAuthService()
    const result = flags['with-project-token']
      ? await service.loginProjectToken({
          profile: flags.profile ?? 'default',
          project: requiredProject(flags.project),
          projectToken: credential,
        })
      : await service.login({
          apiKey: credential,
          profile: flags.profile ?? 'default',
        })
    this.writeValue(
      result,
      `Logged in as profile ${result.name}. Credentials are stored in the operating-system keyring.`,
      flags,
    )
  }
}

function requiredProject(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      '--with-project-token requires --project before a credential is read.',
      'project',
    )
  }
  return value
}
