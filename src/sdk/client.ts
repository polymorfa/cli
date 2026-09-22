import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
  type ApiResponse,
  type ClientInstance,
  type RawClient,
  type SharedClientOptions,
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

export type CallRetentionPolicy =
  'short' | 'standard' | 'extended' | 'compliance' | 'custom'

/** Team call data retention, as `/platform/call-retention` returns it. */
export interface CallRetention {
  readonly appliesTo: readonly string[]
  readonly policy: CallRetentionPolicy
  readonly retentionDays: number
  readonly revision: number
  readonly updatedAt: string | null
}

export interface UpdateCallRetentionInput {
  readonly expectedRevision?: number
  readonly policy: CallRetentionPolicy
  readonly retentionDays?: number
}

export interface CallRetentionClient {
  retrieve(): Promise<ApiResponse<{readonly data: CallRetention}>>
  update(
    input: UpdateCallRetentionInput,
  ): Promise<ApiResponse<{readonly data: CallRetention}>>
}

/**
 * Team call data retention on the Platform API. The pinned SDK has no typed
 * resource for it yet. Team API keys use the SDK organization client's raw
 * transport, which keeps its credential, retry, and error mapping. Project
 * tokens may read this team-wide route, but the pinned SDK confines a
 * project-token client to `/platform/projects/{id}`, so they use
 * `projectTokenRequest`; the API decides what each principal may do. Replace
 * both with the SDK's `callRetention` resource once a release that includes
 * it is pinned (polymorfa/sdks#278).
 */
export function createCallRetentionClient(
  environment: TeamSettingEnvironment,
): CallRetentionClient {
  if (environment.principalType === 'project_token') {
    return {
      retrieve: () =>
        projectTokenRequest<{readonly data: CallRetention}>(environment, {
          method: 'GET',
          path: '/platform/call-retention',
        }),
      update: (input) =>
        projectTokenRequest<{readonly data: CallRetention}>(environment, {
          body: input,
          method: 'PUT',
          path: '/platform/call-retention',
        }),
    }
  }
  const raw = new Client({
    baseUrl: environment.baseUrl,
    credential: {type: 'organizationApiKey', value: environment.credential},
    ...(environment.apiVersion === undefined
      ? {}
      : {apiVersion: environment.apiVersion}),
    ...(environment.timeoutMs === undefined
      ? {}
      : {timeoutMs: environment.timeoutMs}),
  }).raw
  return {
    retrieve: () =>
      raw.request<{readonly data: CallRetention}>({
        method: 'GET',
        path: '/platform/call-retention',
      }),
    update: (input) =>
      raw.request<{readonly data: CallRetention}>({
        body: input,
        method: 'PUT',
        path: '/platform/call-retention',
      }),
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
