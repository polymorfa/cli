import {Command, Flags, type Interfaces} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  type ClientInstance,
  type MessagingClient,
} from '@polymorfa/sdk'

import {
  resolveCommandEnvironment,
  resolveDeveloperEnvironment,
  resolveListenerEnvironment,
  type DeveloperEnvironment,
  type ResolvedEnvironment,
} from './context/environment.js'
import {findProjectLink} from './config/project-link.js'
import {presentError, renderErrorDetails} from './errors/present.js'
import {errorEnvelope, type OutputContext} from './output/contracts.js'
import {renderValue, type OutputMode} from './output/render.js'
import {createMessagingClient, createPlatformClient} from './sdk/client.js'
import {
  createDeveloperSession,
  type DeveloperSession,
} from './developer/client.js'

export interface GlobalFlags {
  readonly 'api-version'?: string | undefined
  readonly json?: boolean | undefined
  readonly 'no-color'?: boolean | undefined
  readonly owner?: string | undefined
  readonly profile?: string | undefined
  readonly project?: string | undefined
  readonly quiet?: boolean | undefined
  readonly timeout?: number | undefined
  readonly verbose?: boolean | undefined
}

export abstract class BaseCommand extends Command {
  private errorContext: Partial<OutputContext> = {}
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
    owner: Flags.string({
      description: 'Select project-owned or organization-owned resources.',
      helpGroup: 'GLOBAL',
      options: ['project', 'organization'],
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

  protected async developerSession(
    flags: GlobalFlags,
  ): Promise<DeveloperSession> {
    const session = await createDeveloperSession(
      flags,
      (secret) => this.registerSecret(secret),
      await this.linkedProject(flags),
    )
    this.errorContext = session.context
    return session
  }

  /**
   * Resolve an organization API key or exact-project token without building a
   * typed client, for commands that span projects. With `inferOwner`, --project
   * or a project token reads one project and an organization key otherwise
   * reads the whole organization.
   */
  protected async developerEnvironment(
    flags: GlobalFlags,
    options: {readonly inferOwner?: boolean} = {},
  ): Promise<DeveloperEnvironment> {
    const environment = await resolveDeveloperEnvironment({
      env: process.env,
      ...(flags['api-version'] === undefined
        ? {}
        : {apiVersion: flags['api-version']}),
      ...(options.inferOwner === undefined
        ? {}
        : {inferOwner: options.inferOwner}),
      ...(flags.owner === undefined ? {} : {owner: flags.owner}),
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags.project === undefined ? {} : {project: flags.project}),
      ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
    })
    this.registerSecret(environment.credential)
    this.errorContext = environment.context
    return environment
  }

  protected async messagingClient(
    flags: GlobalFlags,
    options: {readonly serverApiKeyOnly?: string} = {},
  ): Promise<MessagingClient> {
    const environment = await this.messagingEnvironment(flags)
    if (
      options.serverApiKeyOnly !== undefined &&
      environment.credential.type !== 'apiKey'
    ) {
      throw new PolymorfaConfigurationError(
        `${options.serverApiKeyOnly} commands require a server API key; Messaging client tokens do not have ${options.serverApiKeyOnly} access. Set POLYMORFA_API_KEY or select an API-key profile.`,
        'credential',
      )
    }
    return createMessagingClient(environment)
  }

  protected async quickLinksClient(flags: GlobalFlags): Promise<{
    client: MessagingClient
    projectId: string
  }> {
    const linkedProject = await this.linkedProject(flags)
    const environment = await resolveListenerEnvironment({
      env: process.env,
      ...(linkedProject === undefined ? {} : {linkedProject}),
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags.project === undefined ? {} : {project: flags.project}),
      ...(flags['api-version'] === undefined
        ? {}
        : {apiVersion: flags['api-version']}),
      ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
    })
    this.registerSecret(environment.credential)
    return {
      client: createMessagingClient({
        ...(environment.apiVersion === undefined
          ? {}
          : {apiVersion: environment.apiVersion}),
        baseUrl: environment.baseUrl,
        credential: {
          type:
            environment.principalType === 'project_token'
              ? 'projectToken'
              : 'apiKey',
          value: environment.credential,
        },
        surface: 'messaging',
        ...(environment.timeoutMs === undefined
          ? {}
          : {timeoutMs: environment.timeoutMs}),
      }),
      projectId: environment.projectId,
    }
  }

  /**
   * Project from the nearest `polymorfa.json`, used only when
   * --project is absent. It ranks above the profile's stored project.
   */
  protected async linkedProject(
    flags: GlobalFlags,
  ): Promise<string | undefined> {
    if (flags.project !== undefined) return undefined
    const link = await findProjectLink()
    if (link !== undefined && flags.verbose === true) {
      process.stderr.write(`Using project ${link.project} from ${link.path}\n`)
    }
    return link?.project
  }

  /** Resolve Messaging credentials once, for commands that also open sockets. */
  protected async messagingEnvironment(
    flags: GlobalFlags,
  ): Promise<ResolvedEnvironment> {
    return this.resolveEnvironment(flags, 'messaging')
  }

  protected async platformClient(
    flags: GlobalFlags,
  ): Promise<ClientInstance<'organization'>> {
    return createPlatformClient(await this.platformEnvironment(flags))
  }

  /** Resolve Platform credentials: server API keys only. */
  protected async platformEnvironment(
    flags: GlobalFlags,
  ): Promise<ResolvedEnvironment> {
    return this.resolveEnvironment(flags, 'platform')
  }

  private async resolveEnvironment(
    flags: GlobalFlags,
    surface: ResolvedEnvironment['surface'],
  ): Promise<ResolvedEnvironment> {
    const environment = await resolveCommandEnvironment({
      env: process.env,
      surface,
      ...(flags.profile === undefined ? {} : {profile: flags.profile}),
      ...(flags['api-version'] === undefined
        ? {}
        : {apiVersion: flags['api-version']}),
      ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
    })
    this.registerSecret(environment.credential.value)
    return environment
  }

  protected registerSecret(secret: string): void {
    if (secret.length > 0) this.registeredSecrets.push(secret)
  }

  protected override catch(error: Interfaces.CommandError): Promise<never> {
    const presented = presentError(error, [
      process.env.POLYMORFA_API_KEY ?? '',
      process.env.POLYMORFA_CLIENT_TOKEN ?? '',
      process.env.POLYMORFA_PROJECT_TOKEN ?? '',
      ...this.registeredSecrets,
    ])

    if (this.argv.includes('--json')) {
      process.stderr.write(
        `${JSON.stringify(
          errorEnvelope({
            category: presented.category,
            code: presented.code,
            context: this.errorContext,
            message: presented.message,
            ...(presented.requestId === undefined
              ? {}
              : {requestId: presented.requestId}),
            ...(presented.requestLogUrl === undefined
              ? {}
              : {requestLogUrl: presented.requestLogUrl}),
            ...(presented.docUrl === undefined
              ? {}
              : {docUrl: presented.docUrl}),
            retryable: presented.retryable,
          }),
        )}\n`,
      )
    } else {
      process.stderr.write(renderErrorDetails(presented))
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
