import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
  type ApiResponse,
  type CallRetention,
  type CallRetentionPolicy,
  type ClientInstance,
  type RawClient,
  type SharedClientOptions,
  type UpdateCallRetentionRequest,
} from '@polymorfa/sdk'

import type {
  ResolvedEnvironment,
  TeamSettingEnvironment,
} from '../context/environment.js'
import {projectTokenRequest} from './project-token-request.js'

export function createRawClient(environment: ResolvedEnvironment): RawClient {
  return environment.surface === 'platform'
    ? createPlatformClient(environment).raw
    : createMessagingClient(environment).raw
}

export function createMessagingClient(
  environment: ResolvedEnvironment,
): MessagingClient {
  if (environment.surface !== 'messaging') {
    throw new PolymorfaConfigurationError(
      'A typed Messaging client requires the Messaging API surface.',
      'surface',
    )
  }

  return new MessagingClient({
    credential: environment.credential,
    ...sharedOptions(environment),
  })
}

/**
 * Session call settings live on the Platform API, but the SDK exposes them on
 * the Messaging client's Calls resource. Build that client from a resolved
 * Platform environment so the Platform credential rules (server API keys
 * only) still apply.
 */
export function createCallSettingsClient(
  environment: ResolvedEnvironment,
): MessagingClient {
  if (environment.surface !== 'platform') {
    throw new PolymorfaConfigurationError(
      'Session call settings require the Platform API surface.',
      'surface',
    )
  }

  return new MessagingClient({
    credential: {type: 'apiKey', value: environment.credential.value},
    ...sharedOptions(environment),
  })
}

export type {CallRetention, CallRetentionPolicy}

export interface UpdateCallRetentionInput {
  readonly expectedRevision?: number
  readonly policy: CallRetentionPolicy
  readonly retentionDays?: number
}

export interface CallRetentionClient {
  retrieve(): Promise<ApiResponse<CallRetention>>
  update(input: UpdateCallRetentionInput): Promise<ApiResponse<CallRetention>>
}

/**
 * Team API keys use the typed SDK resource. Project tokens can read this
 * team-wide route without a project ID, but the SDK's project-token client
 * currently requires one; keep the narrow request bridge until the SDK has
 * an explicit team-wide project-token entrypoint.
 */
export function createCallRetentionClient(
  environment: TeamSettingEnvironment,
): CallRetentionClient {
  if (environment.principalType === 'project_token') {
    return {
      retrieve: async () => {
        const response = await projectTokenRequest<{
          readonly data: CallRetention
        }>(environment, {
          method: 'GET',
          path: '/platform/call-retention',
        })
        return {data: response.data.data, metadata: response.metadata}
      },
      update: async (input) => {
        const response = await projectTokenRequest<{
          readonly data: CallRetention
        }>(environment, {
          body: input,
          method: 'PUT',
          path: '/platform/call-retention',
        })
        return {data: response.data.data, metadata: response.metadata}
      },
    }
  }
  const callRetention = new Client({
    baseUrl: environment.baseUrl,
    credential: {type: 'organizationApiKey', value: environment.credential},
    ...(environment.apiVersion === undefined
      ? {}
      : {apiVersion: environment.apiVersion}),
    ...(environment.timeoutMs === undefined
      ? {}
      : {timeoutMs: environment.timeoutMs}),
  }).callRetention
  return {
    retrieve: () => callRetention.retrieve(),
    update: (input) =>
      callRetention.update(input as UpdateCallRetentionRequest),
  }
}

export function createPlatformClient(
  environment: ResolvedEnvironment,
): ClientInstance<'organization'> {
  if (environment.surface !== 'platform') {
    throw new PolymorfaConfigurationError(
      'A typed Platform client requires the Platform API surface.',
      'surface',
    )
  }

  return new Client({
    credential: {
      type: 'organizationApiKey',
      value: environment.credential.value,
    },
    ...sharedOptions(environment),
  })
}

function sharedOptions(environment: ResolvedEnvironment): SharedClientOptions {
  return {
    ...(environment.baseUrl === undefined
      ? {}
      : {baseUrl: environment.baseUrl}),
    ...(environment.apiVersion === undefined
      ? {}
      : {apiVersion: environment.apiVersion}),
    ...(environment.timeoutMs === undefined
      ? {}
      : {timeoutMs: environment.timeoutMs}),
  }
}
