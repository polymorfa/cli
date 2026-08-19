import {BaseCommand} from '../../base-command.js'
import {createAuthService} from '../../config/auth-service.js'
import {
  PolymorfaConfigurationError,
  validateMessagingCredential,
  validatePlatformApiKey,
} from '@polymorfa/sdk'

export default class AuthStatus extends BaseCommand {
  static override description =
    'Inspect local profile metadata and secure credential availability.'

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthStatus)
    const environment = environmentStatus(process.env, flags.profile)
    if (environment !== undefined) {
      this.registerSecret(environment.secret)
      this.writeValue(
        environment.result,
        'Environment credential: present and locally valid; remote identity was not exercised.',
        flags,
      )
      return
    }

    const result = await createAuthService().status(flags.profile)
    const availability = result.credentialPresent ? 'present' : 'missing'
    const validity = result.credentialFormatValid ? 'valid' : 'invalid'
    this.writeValue(
      result,
      `Profile ${result.name}: credential ${availability} in ${result.source}; format ${validity}; remote identity not exercised.`,
      flags,
    )
  }
}

function environmentStatus(
  env: Readonly<Record<string, string | undefined>>,
  requestedProfile: string | undefined,
):
  | {
      readonly result: {
        readonly credentialFormatValid: true
        readonly credentialKind: 'apiKey' | 'clientToken'
        readonly credentialPresent: true
        readonly remoteIdentityValidated: false
        readonly source: 'environment'
      }
      readonly secret: string
    }
  | undefined {
  if (requestedProfile !== undefined) return undefined
  const apiKey = nonEmpty(env.POLYMORFA_API_KEY)
  const clientToken = nonEmpty(env.POLYMORFA_CLIENT_TOKEN)
  if (apiKey !== undefined && clientToken !== undefined) {
    throw new PolymorfaConfigurationError(
      'Authentication status is ambiguous; set only POLYMORFA_API_KEY or POLYMORFA_CLIENT_TOKEN, or select --profile <name>.',
      'credential',
    )
  }

  if (apiKey !== undefined) validatePlatformApiKey(apiKey)
  if (clientToken !== undefined) {
    validateMessagingCredential({type: 'clientToken', value: clientToken})
  }
  const secret = apiKey ?? clientToken
  if (secret === undefined) return undefined
  return {
    secret,
    result: {
      credentialFormatValid: true,
      credentialKind: apiKey === undefined ? 'clientToken' : 'apiKey',
      credentialPresent: true,
      remoteIdentityValidated: false,
      source: 'environment',
    },
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
