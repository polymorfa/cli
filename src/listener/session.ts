import {randomUUID} from 'node:crypto'

import type {ListenerCheckpoint} from './checkpoint.js'
import {writeCheckpoint} from './checkpoint.js'
import {ListenerFrameDecoder, type ListenerFrame} from './frames.js'
import type {ListenerAuthorization, ListenerCloseReason} from './protocol.js'
import {decodeSse, ListenerProtocolError} from './sse.js'

export type ListenerTerminalCondition =
  | 'success'
  | 'interrupted'
  | 'stream_gap'
  | 'stream_dropped'
  | 'forwarding_failed'
  | 'authorization'

export interface ListenLine {
  readonly schemaVersion: 1
  readonly listenerId: string
  readonly streamId: string | null
  readonly sequence: number
  readonly observedAt: string
  readonly type: string
  readonly [key: string]: unknown
}

export interface ListenerProtocol {
  authorize(input: {
    readonly projectId: string
    readonly events: readonly string[]
    readonly resumeCursor: string | null
    readonly signal?: AbortSignal
  }): Promise<ListenerAuthorization>
  open(
    authorization: ListenerAuthorization,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>
  ack(
    authorization: ListenerAuthorization,
    cursor: string,
    sequence: number,
    signal?: AbortSignal,
  ): Promise<void>
  close(
    authorization: ListenerAuthorization,
    reason: ListenerCloseReason,
    signal?: AbortSignal,
  ): Promise<void>
}

export interface RunListenerInput {
  readonly protocol: ListenerProtocol
  readonly projectId: string
  readonly events: readonly string[]
  readonly maxBuffer?: number
  readonly resumeCursor?: string | null
  readonly checkpointFile?: string
  readonly onGap?: 'stop' | 'continue'
  readonly onProgress?: (progress: ListenProgress) => void
  readonly waitBeforeReconnect?: (
    attempt: number,
    signal: AbortSignal | undefined,
  ) => Promise<void>
  readonly signal?: AbortSignal
  readonly output: (line: ListenLine) => Promise<void>
  readonly forward?: (input: {
    readonly body: Uint8Array
    readonly event: Record<string, unknown>
  }) => Promise<void>
}

export interface ListenProgress {
  readonly acknowledged: number
  readonly forwarded: number
  readonly received: number
}

export interface ListenResult {
  readonly condition: ListenerTerminalCondition
  readonly lastAcknowledgedCursor: string | null
  readonly received: number
  readonly acknowledged: number
  readonly forwarded: number
}

export async function runListener(
  input: RunListenerInput,
): Promise<ListenResult> {
  const maxBuffer = input.maxBuffer ?? 256
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > 4096) {
    throw new ListenerProtocolError(
      'listener_buffer_invalid',
      'The local listener buffer must contain 1 through 4096 events.',
    )
  }
  let resumeCursor = input.resumeCursor ?? null
  let lastAcknowledgedCursor = resumeCursor
  let received = 0
  let acknowledged = 0
  let forwarded = 0
  let reconnectAttempt = 0
  let lastAuthorization: ListenerAuthorization | undefined
  let observedSequence = 0
  const localListenerId = randomUUID()
  const delivered = new Map<string, true>()

  while (!input.signal?.aborted) {
    let authorization: ListenerAuthorization
    let stream: ReadableStream<Uint8Array>
    try {
      authorization = await input.protocol.authorize({
        events: input.events,
        projectId: input.projectId,
        resumeCursor,
        ...(input.signal ? {signal: input.signal} : {}),
      })
      lastAuthorization = authorization
      validateBufferBound(maxBuffer, authorization.limits.maxInFlight)
      stream = await input.protocol.open(authorization, input.signal)
    } catch (error) {
      if (input.signal?.aborted) {
        if (lastAuthorization) {
          return interrupted(
            input,
            lastAuthorization,
            observedSequence,
            lastAcknowledgedCursor,
            received,
            acknowledged,
            forwarded,
          )
        }
        return interruptedBeforeAuthorization(
          lastAcknowledgedCursor,
          received,
          acknowledged,
          forwarded,
        )
      }
      if (
        error instanceof ListenerProtocolError &&
        error.status === 410 &&
        [
          'listener_cursor_unavailable',
          'resume_cursor_expired',
          'resume_cursor_unavailable',
        ].includes(error.code)
      ) {
        const gap = authorizationGap(error, resumeCursor)
        await input.output({
          ...localLineBase(localListenerId, 'gap'),
          ...gap,
          reason: error.code,
        })
        if (
          input.onGap === 'continue' &&
          typeof gap.oldestAvailableCursor === 'string'
        ) {
          const old = lastAcknowledgedCursor
          resumeCursor = gap.oldestAvailableCursor
          await input.output({
            ...localLineBase(localListenerId, 'discontinuity'),
            fromCursor: old,
            reason: 'gap_continue',
            toCursor: resumeCursor,
          })
          await (input.waitBeforeReconnect ?? waitBeforeReconnect)(
            reconnectAttempt,
            input.signal,
          )
          reconnectAttempt = Math.min(reconnectAttempt + 1, 31)
          continue
        }
        await input.output({
          ...localLineBase(localListenerId, 'terminal'),
          condition: 'stream_gap',
          lastAcknowledgedCursor,
        })
        return {
          acknowledged,
          condition: 'stream_gap',
          forwarded,
          lastAcknowledgedCursor,
          received,
        }
      }
      if (error instanceof ListenerProtocolError && error.safeToReauthorize) {
        await (input.waitBeforeReconnect ?? waitBeforeReconnect)(
          reconnectAttempt,
          input.signal,
        )
        reconnectAttempt = Math.min(reconnectAttempt + 1, 31)
        continue
      }
      throw error
    }
    const decoder = new ListenerFrameDecoder({
      heartbeatIntervalMs: authorization.limits.heartbeatIntervalMs,
      maxInFlight: authorization.limits.maxInFlight,
      projectId: authorization.projectId,
      resume: authorization.resume,
      streamId: authorization.streamId,
    })
    observedSequence = 0

    try {
      for await (const record of decodeSse(
        stream,
        authorization.limits.maxEventBytes,
      )) {
        const frame = decoder.decode(record)
        if (frame.type !== 'ready') reconnectAttempt = 0
        observedSequence = frame.sequence
        received +=
          frame.type === 'event' || frame.type === 'event_unavailable' ? 1 : 0
        progress(input, received, acknowledged, forwarded)
        const base = lineBase(authorization, frame)

        if (frame.type === 'heartbeat') continue
        if (frame.type === 'ready') {
          await input.output({
            ...base,
            acceptedCursor: authorization.resume.acceptedCursor,
            connectionExpiresAt: requiredString(frame, 'connectionExpiresAt'),
            filters: authorization.filters,
            projectId: authorization.projectId,
            startPosition: authorization.resume.startPosition,
          })
          continue
        }
        if (frame.type === 'backpressure') {
          await input.output({...base, ...withoutBase(frame)})
          continue
        }
        if (frame.type === 'event') {
          const event = recordField(frame, 'event')
          const body = recordField(frame, 'body')
          const bytes = Buffer.from(requiredString(body, 'data'), 'base64')
          const key = deliveryKey(frame, event)
          if (!delivered.has(key)) {
            await input.output({...base, body, cursor: frame.cursor, event})
            if (input.forward) {
              try {
                await input.forward({body: bytes, event})
              } catch {
                if (input.signal?.aborted) {
                  return interrupted(
                    input,
                    authorization,
                    frame.sequence,
                    lastAcknowledgedCursor,
                    received,
                    acknowledged,
                    forwarded,
                  )
                }
                await bestEffortClose(input, authorization, 'forwarding_failed')
                await terminal(
                  input,
                  authorization,
                  frame.sequence,
                  'forwarding_failed',
                  lastAcknowledgedCursor,
                )
                return {
                  acknowledged,
                  condition: 'forwarding_failed',
                  forwarded,
                  lastAcknowledgedCursor,
                  received,
                }
              }
              forwarded += 1
              progress(input, received, acknowledged, forwarded)
            }
            remember(delivered, key, maxBuffer)
          }
          await acknowledge(input, authorization, frame)
          lastAcknowledgedCursor = frame.cursor ?? null
          resumeCursor = lastAcknowledgedCursor
          acknowledged += 1
          progress(input, received, acknowledged, forwarded)
          await saveCheckpoint(
            input,
            authorization,
            frame,
            lastAcknowledgedCursor,
          )
          continue
        }
        if (frame.type === 'event_unavailable') {
          const event = recordField(frame, 'event')
          const key = deliveryKey(frame, event)
          if (!delivered.has(key)) {
            await input.output({...base, ...withoutBase(frame)})
            remember(delivered, key, maxBuffer)
          }
          if (input.forward) {
            await bestEffortClose(input, authorization, 'forwarding_failed')
            await terminal(
              input,
              authorization,
              frame.sequence,
              'forwarding_failed',
              lastAcknowledgedCursor,
            )
            return {
              acknowledged,
              condition: 'forwarding_failed',
              forwarded,
              lastAcknowledgedCursor,
              received,
            }
          }
          await acknowledge(input, authorization, frame)
          lastAcknowledgedCursor = frame.cursor ?? null
          resumeCursor = lastAcknowledgedCursor
          acknowledged += 1
          progress(input, received, acknowledged, forwarded)
          await saveCheckpoint(
            input,
            authorization,
            frame,
            lastAcknowledgedCursor,
          )
          continue
        }
        if (frame.type === 'checkpoint') {
          await input.output({...base, ...withoutBase(frame)})
          await acknowledge(input, authorization, frame)
          lastAcknowledgedCursor = frame.cursor ?? null
          resumeCursor = lastAcknowledgedCursor
          acknowledged += 1
          progress(input, received, acknowledged, forwarded)
          await saveCheckpoint(
            input,
            authorization,
            frame,
            lastAcknowledgedCursor,
          )
          continue
        }
        if (frame.type === 'gap') {
          await input.output({...base, ...withoutBase(frame)})
          if (
            input.onGap === 'continue' &&
            typeof frame.oldestAvailableCursor === 'string'
          ) {
            const old = lastAcknowledgedCursor
            resumeCursor = frame.oldestAvailableCursor
            await input.output({
              ...base,
              fromCursor: old,
              reason: 'gap_continue',
              toCursor: resumeCursor,
              type: 'discontinuity',
            })
            await bestEffortClose(input, authorization, 'reconnect')
            break
          }
          await bestEffortClose(input, authorization, 'stream_gap')
          await terminal(
            input,
            authorization,
            frame.sequence,
            'stream_gap',
            lastAcknowledgedCursor,
          )
          return {
            acknowledged,
            condition: 'stream_gap',
            forwarded,
            lastAcknowledgedCursor,
            received,
          }
        }
        if (frame.type === 'dropped') {
          await input.output({...base, ...withoutBase(frame)})
          await bestEffortClose(input, authorization, 'stream_dropped')
          await terminal(
            input,
            authorization,
            frame.sequence,
            'stream_dropped',
            lastAcknowledgedCursor,
          )
          return {
            acknowledged,
            condition: 'stream_dropped',
            forwarded,
            lastAcknowledgedCursor,
            received,
          }
        }
        if (frame.type === 'revoked') {
          await input.output({...base, ...withoutBase(frame)})
          await terminal(
            input,
            authorization,
            frame.sequence,
            'authorization',
            lastAcknowledgedCursor,
          )
          return {
            acknowledged,
            condition: 'authorization',
            forwarded,
            lastAcknowledgedCursor,
            received,
          }
        }
        if (frame.type === 'expiry') {
          await input.output({...base, ...withoutBase(frame)})
          await bestEffortClose(input, authorization, 'reconnect')
          break
        }
      }
    } catch (error) {
      if (input.signal?.aborted) {
        return interrupted(
          input,
          authorization,
          observedSequence,
          lastAcknowledgedCursor,
          received,
          acknowledged,
          forwarded,
        )
      }
      await bestEffortClose(input, authorization, 'process_shutdown')
      throw error
    }

    if (!input.signal?.aborted) {
      await (input.waitBeforeReconnect ?? waitBeforeReconnect)(
        reconnectAttempt,
        input.signal,
      )
      reconnectAttempt = Math.min(reconnectAttempt + 1, 31)
      continue
    }
  }

  if (lastAuthorization) {
    return interrupted(
      input,
      lastAuthorization,
      observedSequence,
      lastAcknowledgedCursor,
      received,
      acknowledged,
      forwarded,
    )
  }
  return interruptedBeforeAuthorization(
    lastAcknowledgedCursor,
    received,
    acknowledged,
    forwarded,
  )
}

function interruptedBeforeAuthorization(
  cursor: string | null,
  received: number,
  acknowledged: number,
  forwarded: number,
): ListenResult {
  return {
    acknowledged,
    condition: 'interrupted',
    forwarded,
    lastAcknowledgedCursor: cursor,
    received,
  }
}

function waitBeforeReconnect(
  attempt: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  const exponential = 250 * 2 ** Math.min(attempt, 5)
  const jitter = 0.8 + Math.random() * 0.4
  const delay = Math.min(10_000, Math.round(exponential * jitter))
  if (signal?.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, delay)
    signal?.addEventListener('abort', done, {once: true})
  })
}

function validateBufferBound(
  configured: number,
  serverMaxInFlight: number,
): void {
  if (!Number.isSafeInteger(serverMaxInFlight) || serverMaxInFlight < 1) {
    throw new ListenerProtocolError(
      'listener_authorization_invalid',
      'The listener authorization contains an invalid in-flight limit.',
    )
  }
  // The loop deliberately does not request the next decoded record until the
  // current record has cleared every active sink and ACK. Its decoded-event
  // capacity is therefore one, a stricter bound than both negotiated limits.
  if (Math.min(configured, serverMaxInFlight) < 1) {
    throw new ListenerProtocolError(
      'listener_buffer_invalid',
      'The listener buffer is unavailable.',
    )
  }
}

function progress(
  input: RunListenerInput,
  received: number,
  acknowledged: number,
  forwarded: number,
): void {
  input.onProgress?.({acknowledged, forwarded, received})
}

async function acknowledge(
  input: RunListenerInput,
  authorization: ListenerAuthorization,
  frame: ListenerFrame,
): Promise<void> {
  if (!frame.cursor)
    throw new Error('Acknowledgeable listener frame is missing its cursor.')
  await input.protocol.ack(
    authorization,
    frame.cursor,
    frame.sequence,
    input.signal,
  )
}

async function saveCheckpoint(
  input: RunListenerInput,
  authorization: ListenerAuthorization,
  frame: ListenerFrame,
  cursor: string | null,
): Promise<void> {
  if (!input.checkpointFile || !cursor) return
  const cursorExpiresAt =
    typeof frame.cursorExpiresAt === 'string'
      ? frame.cursorExpiresAt
      : authorization.resume.cursorExpiresAt
  if (!cursorExpiresAt) return
  const checkpoint: ListenerCheckpoint = {
    cursorExpiresAt,
    filters: {events: authorization.filters.events},
    kind: 'polymorfa_cli_listener_checkpoint',
    lastAcknowledgedCursor: cursor,
    projectId: input.projectId,
    protocolVersion: '1',
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  }
  await writeCheckpoint(input.checkpointFile, checkpoint)
}

async function terminal(
  input: RunListenerInput,
  authorization: ListenerAuthorization,
  sequence: number,
  condition: ListenerTerminalCondition,
  cursor: string | null,
): Promise<void> {
  await input.output({
    condition,
    lastAcknowledgedCursor: cursor,
    listenerId: authorization.authorizationId,
    observedAt: new Date().toISOString(),
    schemaVersion: 1,
    sequence,
    streamId: authorization.streamId,
    type: 'terminal',
  })
}

async function bestEffortClose(
  input: RunListenerInput,
  authorization: ListenerAuthorization,
  reason: ListenerCloseReason,
): Promise<void> {
  await input.protocol
    .close(authorization, reason, AbortSignal.timeout(5000))
    .catch(() => {})
}

async function interrupted(
  input: RunListenerInput,
  authorization: ListenerAuthorization,
  sequence: number,
  cursor: string | null,
  received: number,
  acknowledged: number,
  forwarded: number,
): Promise<ListenResult> {
  await bestEffortClose(input, authorization, 'interrupted')
  await terminal(input, authorization, sequence, 'interrupted', cursor)
  return {
    acknowledged,
    condition: 'interrupted',
    forwarded,
    lastAcknowledgedCursor: cursor,
    received,
  }
}

function lineBase(
  authorization: ListenerAuthorization,
  frame: ListenerFrame,
): ListenLine {
  return {
    listenerId: authorization.authorizationId,
    observedAt: new Date().toISOString(),
    schemaVersion: 1,
    sequence: frame.sequence,
    streamId: authorization.streamId,
    type: frame.type,
  }
}

function withoutBase(frame: ListenerFrame): Record<string, unknown> {
  const baseKeys = new Set(['sentAt', 'sequence', 'streamId', 'type', 'v'])
  return Object.fromEntries(
    Object.entries(frame).filter(([key]) => !baseKeys.has(key)),
  )
}

function recordField(
  frame: ListenerFrame,
  key: string,
): Record<string, unknown> {
  const value = frame[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Listener frame ${key} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string')
    throw new Error(`Listener frame ${key} must be a string.`)
  return field
}

function authorizationGap(
  error: ListenerProtocolError,
  requestedCursor: string | null,
): {
  readonly requestedCursor: string | null
  readonly oldestAvailableCursor: string | null
  readonly cursorExpiresAt: string | null
  readonly recoverable: boolean
} {
  const details = error.details
  const oldestAvailableCursor = nullableStringField(
    details,
    'oldestAvailableCursor',
  )
  return {
    cursorExpiresAt: nullableStringField(details, 'cursorExpiresAt'),
    oldestAvailableCursor,
    recoverable: oldestAvailableCursor !== null,
    requestedCursor:
      nullableStringField(details, 'requestedCursor') ?? requestedCursor,
  }
}

function localLineBase(listenerId: string, type: string): ListenLine {
  return {
    listenerId,
    observedAt: new Date().toISOString(),
    schemaVersion: 1,
    sequence: 0,
    streamId: null,
    type,
  }
}

function deliveryKey(
  frame: ListenerFrame,
  event: Record<string, unknown>,
): string {
  return `${frame.cursor ?? ''}\0${requiredString(event, 'id')}`
}

function remember(
  delivered: Map<string, true>,
  key: string,
  maximum: number,
): void {
  delivered.set(key, true)
  while (delivered.size > maximum) {
    const oldest = delivered.keys().next().value
    if (oldest === undefined) return
    delivered.delete(oldest)
  }
}

function nullableStringField(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | null {
  const field = value?.[key]
  return typeof field === 'string' && field.length > 0 ? field : null
}
