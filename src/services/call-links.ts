import {PolymorfaConfigurationError, type MessagingClient} from '@polymorfa/sdk'
import type {CallsCredential} from './calls.js'
import {readSecretFromStdin} from '../input/stdin.js'

export function assertCallLinkCredential(credential: CallsCredential): void {
  if (credential.type === 'clientToken')
    throw new PolymorfaConfigurationError(
      'Call links require a server API key; browser client tokens are refused.',
      'credential',
    )
}

export async function createCallLink(
  client: MessagingClient,
  credential: CallsCredential,
  session: string,
  video: boolean,
) {
  assertCallLinkCredential(credential)
  const response = await client.voip.createCallLink({session, video})
  return {
    data: response.data.data,
    metadata: {
      status: response.metadata.status,
      attempts: response.metadata.attempts,
      ...(response.metadata.requestId
        ? {requestId: response.metadata.requestId}
        : {}),
    },
  }
}

export async function previewCallLink(
  client: MessagingClient,
  credential: CallsCredential,
  session: string,
  video: boolean,
) {
  assertCallLinkCredential(credential)
  if (process.stdin.isTTY)
    throw new PolymorfaConfigurationError(
      'Pipe the private call-link token through standard input.',
      'stdin',
    )
  const token = await readSecretFromStdin()
  const response = await client.voip.previewCallLink({session, token, video})
  return {
    data: response.data.data,
    metadata: {
      status: response.metadata.status,
      attempts: response.metadata.attempts,
      ...(response.metadata.requestId
        ? {requestId: response.metadata.requestId}
        : {}),
    },
  }
}
