import {lstat} from 'node:fs/promises'

import {loadCheckpoint} from '../listener/checkpoint.js'
import {
  createForwardingSecret,
  forwardEvent,
  validateForwardDestination,
} from '../listener/forwarding.js'
import {ListenerProtocolClient} from '../listener/protocol.js'
import {runListener} from '../listener/session.js'
import {prepareSecretFile} from '../security/secret-file.js'
import {ListenerManager, type ListenStartInput} from './listener-manager.js'

export function createListenerManager(version: string): ListenerManager {
  return new ListenerManager((input, signal, onProgress) =>
    runManagedListener(input, signal, version, onProgress),
  )
}

async function runManagedListener(
  input: ListenStartInput,
  signal: AbortSignal,
  version: string,
  onProgress: (value: {
    readonly acknowledged: number
    readonly forwarded: number
    readonly received: number
  }) => void,
) {
  const {resolveListenerEnvironment} = await import('../context/environment.js')
  const environment = await resolveListenerEnvironment({
    env: process.env,
    project: input.projectId,
  })
  await Promise.all(
    input.forwardTo.map((target) =>
      validateForwardDestination(target, input.allowRemoteForward ?? false),
    ),
  )
  const secretFile = await prepareSecretFile(input.forwardSecretOut)
  const secret = createForwardingSecret()
  await secretFile.write(secret)

  let resumeCursor = input.from ?? null
  if (input.checkpointFile && (await exists(input.checkpointFile))) {
    const checkpoint = await loadCheckpoint(
      input.checkpointFile,
      environment.projectId,
      input.events ?? ['*'],
    )
    if (Date.parse(checkpoint.cursorExpiresAt) <= Date.now()) {
      throw Object.assign(new Error('The listener checkpoint expired.'), {
        code: 'stream_gap',
      })
    }
    resumeCursor = checkpoint.lastAcknowledgedCursor
  }

  const protocol = new ListenerProtocolClient({
    apiOrigin: environment.baseUrl,
    credential: environment.credential,
    fetch: globalThis.fetch,
    version,
  })
  return runListener({
    ...(input.checkpointFile ? {checkpointFile: input.checkpointFile} : {}),
    events: input.events ?? ['*'],
    forward: async ({body, event}) =>
      forwardEvent({
        ...(input.allowRemoteForward === undefined
          ? {}
          : {allowRemote: input.allowRemoteForward}),
        body,
        eventId: field(event, 'id'),
        eventType: field(event, 'type'),
        ...(input.followRedirects === undefined
          ? {}
          : {followRedirects: input.followRedirects}),
        secret,
        signal,
        targets: input.forwardTo,
      }),
    onGap: input.onGap ?? 'stop',
    ...(input.maxBuffer === undefined ? {} : {maxBuffer: input.maxBuffer}),
    onProgress,
    output: async () => {},
    projectId: environment.projectId,
    protocol,
    resumeCursor,
    signal,
  })
}

function field(value: Record<string, unknown>, key: string): string {
  const result = value[key]
  if (typeof result !== 'string' || result.length === 0) {
    throw new Error(`Listener event ${key} must be a nonempty string.`)
  }
  return result
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
}
