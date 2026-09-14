import {Command, Flags, type Interfaces} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type MessagingClient,
  type Client as PlatformClient,
} from '@polymorfa/sdk'

import {resolveCommandEnvironment} from './context/environment.js'
import {presentError} from './errors/present.js'
import {renderValue, type OutputMode} from './output/render.js'
import {createMessagingClient, createPlatformClient} from './sdk/client.js'

export interface GlobalFlags {
  readonly 'api-version'?: string | undefined
  readonly json?: boolean | undefined
  readonly 'no-color'?: boolean | undefined
  readonly organization?: string | undefined
  readonly profile?: string | undefined
  readonly project?: string | undefined
  readonly quiet?: boolean | undefined
  readonly timeout?: number | undefined
  readonly verbose?: boolean | undefined
}

export abstract class BaseCommand extends Command {
  private readonly registeredSecrets: string[] = []

  static override baseFlags = {
    'api-version': Flags.string({
      description: 'Override the API version for this request.',
      helpGroup: 'GLOBAL',
    }),
    json: Flags.boolean({
      description: 'Print one JSON document.',
      exclusive: ['quiet'],
      helpGroup: 'GLOBAL',
    }),
    'no-color': Flags.boolean({
      description: 'Disable color output.',
      helpGroup: 'GLOBAL',
    }),
    organization: Flags.string({
      description: 'Use an organization other than the active context.',
      helpGroup: 'GLOBAL',
    }),
    profile: Flags.string({
      description: 'Use a named authentication profile.',
      helpGroup: 'GLOBAL',
    }),
    project: Flags.string({
      description: 'Use a project other than the active context.',
      helpGroup: 'GLOBAL',
    }),
    quiet: Flags.boolean({
      description: 'Suppress successful output.',
      exclusive: ['json'],
      helpGroup: 'GLOBAL',
    }),
    timeout: Flags.integer({
      description: 'Fail the request after this many milliseconds.',
      helpGroup: 'GLOBAL',
      min: 1,
    }),
    verbose: Flags.boolean({
      description: 'Explain context and workflow decisions.',
      helpGroup: 'GLOBAL',
    }),
  }

  protected outputMode(flags: GlobalFlags): OutputMode {
    if (flags.quiet === true) return 'quiet'
    if (flags.json === true) return 'json'
    return 'human'
  }

  protected async messagingClient(
    flags: GlobalFlags,
    options: {readonly serverApiKeyOnly?: string} = {},
  ): Promise<MessagingClient> {
    const environment = await resolveCommandEnvironment({
      env: process.env,
      surface: 'messaging',
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags['api-version'] === undefined
        ? {}
        : {apiVersion: flags['api-version']}),
      ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
    })
    if (
      options.serverApiKeyOnly !== undefined &&
      environment.credential.type !== 'apiKey'
    ) {
      throw new PolymorfaConfigurationError(
        `${options.serverApiKeyOnly} commands require a server API key; Messaging client tokens do not have ${options.serverApiKeyOnly} access. Set POLYMORFA_API_KEY or select an API-key profile.`,
        'credential',
      )
    }
    this.registerSecret(environment.credential.value)
    return createMessagingClient(environment)
  }

  protected async platformClient(flags: GlobalFlags): Promise<PlatformClient> {
    const environment = await resolveCommandEnvironment({
      env: process.env,
      surface: 'platform',
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags['api-version'] === undefined
        ? {}
        : {apiVersion: flags['api-version']}),
      ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
    })
    this.registerSecret(environment.credential.value)
    return createPlatformClient(environment)
  }

  protected registerSecret(secret: string): void {
    if (secret.length > 0) this.registeredSecrets.push(secret)
  }

  protected override catch(error: Interfaces.CommandError): Promise<never> {
    const presented = presentError(error, [
      process.env.POLYMORFA_API_KEY ?? '',
      process.env.POLYMORFA_CLIENT_TOKEN ?? '',
      ...this.registeredSecrets,
    ])

    if (this.argv.includes('--json')) {
      process.stderr.write(`${JSON.stringify(presented)}\n`)
    } else {
      process.stderr.write(`Error: ${presented.message}\n`)
      if (presented.requestId !== undefined) {
        process.stderr.write(`Request ID: ${presented.requestId}\n`)
      }
    }

    this.exit(presented.exitCode)
  }

  protected writeValue(
    value: unknown,
    human: string,
    flags: GlobalFlags,
  ): void {
    const rendered = renderValue(value, this.outputMode(flags), human)
    if (rendered !== undefined) process.stdout.write(rendered)
  }
}
