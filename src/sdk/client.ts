import {
  MessagingClient,
  PlatformClient,
  type RawClient,
  type SharedClientOptions,
} from '@polymorfa/sdk'

import type {ResolvedEnvironment} from '../context/environment.js'

export function createRawClient(environment: ResolvedEnvironment): RawClient {
  const shared: SharedClientOptions = {
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

  if (environment.surface === 'platform') {
    return new PlatformClient({
      apiKey: environment.credential.value,
      ...shared,
    }).raw
  }

  return new MessagingClient({
    credential: environment.credential,
    ...shared,
  }).raw
}
