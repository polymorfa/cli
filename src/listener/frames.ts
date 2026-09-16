import {ListenerProtocolError, type SseRecord} from './sse.js'

export type ListenerFrameType =
  | 'ready'
  | 'event'
  | 'event_unavailable'
  | 'checkpoint'
  | 'heartbeat'
  | 'gap'
  | 'backpressure'
  | 'dropped'
  | 'expiry'
  | 'revoked'

export interface ListenerFrame {
  readonly v: 1
  readonly type: ListenerFrameType
  readonly streamId: string
  readonly sequence: number
  readonly sentAt: string
  readonly cursor?: string
  readonly [key: string]: unknown
}

const TYPES = new Set<ListenerFrameType>([
  'ready',
  'event',
  'event_unavailable',
  'checkpoint',
  'heartbeat',
  'gap',
  'backpressure',
  'dropped',
  'expiry',
  'revoked',
])

const CURSOR_TYPES = new Set<ListenerFrameType>([
  'event',
  'event_unavailable',
  'checkpoint',
])

const BASE_KEYS = ['sentAt', 'sequence', 'streamId', 'type', 'v'] as const
const FRAME_KEYS: Readonly<Record<ListenerFrameType, readonly string[]>> = {
  backpressure: [...BASE_KEYS, 'graceMs', 'inFlight', 'limit'],
  checkpoint: [...BASE_KEYS, 'cursor', 'cursorExpiresAt'],
  dropped: [
    ...BASE_KEYS,
    'count',
    'fromCursor',
    'reason',
    'recoverable',
    'toCursor',
  ],
  event: [...BASE_KEYS, 'body', 'cursor', 'event'],
  event_unavailable: [
    ...BASE_KEYS,
    'cursor',
    'event',
    'payloadAvailability',
    'reason',
  ],
  expiry: [...BASE_KEYS, 'expiredAt', 'lastCursor'],
  gap: [
    ...BASE_KEYS,
    'cursorExpiresAt',
    'oldestAvailableCursor',
    'reason',
    'recoverable',
    'requestedCursor',
  ],
  heartbeat: [...BASE_KEYS, 'lastCursor', 'serverTime'],
  ready: [
    ...BASE_KEYS,
    'connectionExpiresAt',
    'heartbeatIntervalMs',
    'maxInFlight',
    'projectId',
    'resume',
  ],
  revoked: [...BASE_KEYS, 'lastCursor', 'reason'],
}

export interface ListenerFrameExpectations {
  readonly streamId: string
  readonly projectId: string
  readonly heartbeatIntervalMs: number
  readonly maxInFlight: number
  readonly resume: {
    readonly startPosition: 'now' | 'resume'
    readonly acceptedCursor: string | null
    readonly oldestAvailableCursor: string | null
    readonly cursorExpiresAt: string | null
  }
}

export class ListenerFrameDecoder {
  private lastSequence = 0
  private ready = false
  private readonly expected: ListenerFrameExpectations | undefined
  private readonly streamId: string

  constructor(input: string | ListenerFrameExpectations) {
    this.streamId = typeof input === 'string' ? input : input.streamId
    this.expected = typeof input === 'string' ? undefined : input
  }

  decode(record: SseRecord): ListenerFrame {
    let parsed: unknown
    try {
      parsed = JSON.parse(record.data)
    } catch {
      throw protocol(
        'listener_invalid_json',
        'An SSE record contains invalid JSON.',
      )
    }
    if (!isRecord(parsed)) {
      throw protocol(
        'listener_invalid_frame',
        'An SSE data value must be an object.',
      )
    }

    const type = parsed.type
    if (typeof type !== 'string' || !TYPES.has(type as ListenerFrameType)) {
      throw protocol(
        'listener_unknown_event',
        'The stream sent an unknown event name.',
      )
    }
    if (record.event !== type) {
      throw protocol(
        'listener_event_mismatch',
        'The SSE event name does not match the JSON frame type.',
      )
    }
    if (!this.ready && type !== 'ready') {
      throw protocol(
        'listener_ready_required',
        'The first stream record must be ready.',
      )
    }
    if (this.ready && type === 'ready') {
      throw protocol(
        'listener_ready_repeated',
        'The ready frame may appear only first.',
      )
    }
    if (parsed.v !== 1) {
      throw protocol(
        'listener_version_mismatch',
        'The listener frame version must be 1.',
      )
    }
    if (parsed.streamId !== this.streamId) {
      throw protocol(
        'listener_stream_mismatch',
        'The listener frame has the wrong stream ID.',
      )
    }
    if (
      !Number.isSafeInteger(parsed.sequence) ||
      (parsed.sequence as number) <= this.lastSequence
    ) {
      throw protocol(
        'listener_sequence_invalid',
        'Listener frame sequence values must increase strictly.',
      )
    }
    if (!validTimestamp(parsed.sentAt)) {
      throw protocol(
        'listener_frame_invalid',
        'A listener frame is missing sentAt.',
      )
    }

    requireExactKeys(parsed, FRAME_KEYS[type as ListenerFrameType])

    const cursorType = CURSOR_TYPES.has(type as ListenerFrameType)
    if (cursorType) {
      if (
        typeof parsed.cursor !== 'string' ||
        parsed.cursor.length === 0 ||
        record.id !== parsed.cursor
      ) {
        throw protocol(
          'listener_cursor_mismatch',
          'The SSE id must equal the frame cursor.',
        )
      }
    } else if (record.id !== undefined || parsed.cursor !== undefined) {
      throw protocol(
        'listener_id_forbidden',
        `The ${type} frame must omit the SSE id and cursor fields.`,
      )
    }

    validateType(type as ListenerFrameType, parsed, this.expected)
    if (type === 'ready' && this.expected)
      validateReadyBinding(parsed, this.expected)
    this.lastSequence = parsed.sequence as number
    this.ready = true
    return parsed as ListenerFrame
  }
}

function validateReadyBinding(
  value: Record<string, unknown>,
  expected: ListenerFrameExpectations,
): void {
  if (
    value.projectId !== expected.projectId ||
    value.heartbeatIntervalMs !== expected.heartbeatIntervalMs ||
    value.maxInFlight !== expected.maxInFlight ||
    !sameResume(value.resume, expected.resume)
  ) {
    throw protocol(
      'listener_authorization_mismatch',
      'The ready frame does not match the listener authorization.',
    )
  }
}

function sameResume(
  value: unknown,
  expected: ListenerFrameExpectations['resume'],
): boolean {
  return (
    isRecord(value) &&
    value.startPosition === expected.startPosition &&
    value.acceptedCursor === expected.acceptedCursor &&
    value.oldestAvailableCursor === expected.oldestAvailableCursor &&
    value.cursorExpiresAt === expected.cursorExpiresAt
  )
}

function validateType(
  type: ListenerFrameType,
  value: Record<string, unknown>,
  expected?: ListenerFrameExpectations,
): void {
  if (type === 'ready') {
    requireString(value, 'projectId')
    requireTimestamp(value, 'connectionExpiresAt')
    requireInteger(value, 'heartbeatIntervalMs', 1)
    requireInteger(value, 'maxInFlight', 1)
    validateResume(requireRecord(value, 'resume'))
  } else if (type === 'event') {
    const event = requireRecord(value, 'event')
    validateEventMetadata(event, expected?.projectId)
    if (event.payloadAvailability !== 'available') {
      throw protocol(
        'listener_event_invalid',
        'An event frame must contain an available event.',
      )
    }
    const body = requireRecord(value, 'body')
    requireExactKeys(body, ['contentType', 'data', 'encoding'])
    if (
      body.encoding !== 'base64' ||
      body.contentType !== 'application/json' ||
      typeof body.data !== 'string' ||
      !canonicalBase64(body.data)
    ) {
      throw protocol(
        'listener_body_invalid',
        'An event body is not valid encoded JSON.',
      )
    }
  } else if (type === 'event_unavailable') {
    const event = requireRecord(value, 'event')
    validateEventMetadata(event, expected?.projectId)
    if (
      !['not_retained', 'redacted'].includes(
        String(value.payloadAvailability),
      ) ||
      event.payloadAvailability !== value.payloadAvailability ||
      !['not_retained', 'redacted'].includes(String(value.reason))
    ) {
      throw protocol(
        'listener_unavailable_invalid',
        'An unavailable event contains an invalid availability reason.',
      )
    }
  } else if (type === 'checkpoint') {
    requireTimestamp(value, 'cursorExpiresAt')
  } else if (type === 'heartbeat') {
    requireTimestamp(value, 'serverTime')
    requireNullableString(value, 'lastCursor')
  } else if (type === 'gap') {
    requireNullableString(value, 'requestedCursor')
    requireNullableString(value, 'oldestAvailableCursor')
    requireNullableTimestamp(value, 'cursorExpiresAt')
    requireBoolean(value, 'recoverable')
    requireString(value, 'reason')
  } else if (type === 'backpressure') {
    requireInteger(value, 'inFlight', 0)
    requireInteger(value, 'limit', 1)
    requireInteger(value, 'graceMs', 1)
  } else if (type === 'dropped') {
    requireInteger(value, 'count', 1)
    requireString(value, 'fromCursor')
    requireString(value, 'toCursor')
    requireBoolean(value, 'recoverable')
    requireString(value, 'reason')
  } else if (type === 'expiry') {
    requireTimestamp(value, 'expiredAt')
    requireNullableString(value, 'lastCursor')
  } else {
    requireNullableString(value, 'lastCursor')
    if (value.reason !== 'principal_revoked') {
      throw protocol(
        'listener_revoked_invalid',
        'A revoked frame has an invalid reason.',
      )
    }
  }
}

function validateEventMetadata(
  value: Record<string, unknown>,
  expectedProjectId: string | undefined,
): void {
  requireExactKeys(value, [
    'createdAt',
    'environment',
    'id',
    'metadataExpiresAt',
    'organizationId',
    'payloadAvailability',
    'projectId',
    'replayableUntil',
    'source',
    'type',
  ])
  for (const key of ['id', 'organizationId', 'projectId', 'type'] as const)
    requireString(value, key)
  for (const key of ['id', 'organizationId', 'projectId'] as const) {
    if (!UUID.test(String(value[key]))) {
      throw protocol('listener_event_invalid', `${key} must be a UUID.`)
    }
  }
  if (
    expectedProjectId !== undefined &&
    value.projectId !== expectedProjectId
  ) {
    throw protocol(
      'listener_event_invalid',
      'The listener event belongs to a different project.',
    )
  }
  if (!/^[a-z0-9._:-]+$/.test(String(value.type))) {
    throw protocol(
      'listener_event_invalid',
      'The listener event type is invalid.',
    )
  }
  if (!['runtime', 'platform', 'test'].includes(String(value.source))) {
    throw protocol(
      'listener_event_invalid',
      'The listener event source is invalid.',
    )
  }
  if (!['development', 'production'].includes(String(value.environment))) {
    throw protocol(
      'listener_event_invalid',
      'The listener event environment is invalid.',
    )
  }
  if (
    ![
      'available',
      'not_retained',
      'expired',
      'redacted',
      'unavailable',
    ].includes(String(value.payloadAvailability))
  ) {
    throw protocol(
      'listener_event_invalid',
      'The listener event payload availability is invalid.',
    )
  }
  requireTimestamp(value, 'createdAt')
  requireTimestamp(value, 'metadataExpiresAt')
  requireNullableTimestamp(value, 'replayableUntil')
}

function canonicalBase64(value: string): boolean {
  if (value.length === 0) return false
  try {
    const decoded = Buffer.from(value, 'base64')
    return decoded.length > 0 && decoded.toString('base64') === value
  } catch {
    return false
  }
}

function validateResume(value: Record<string, unknown>): void {
  requireExactKeys(value, [
    'acceptedCursor',
    'cursorExpiresAt',
    'oldestAvailableCursor',
    'startPosition',
  ])
  if (value.startPosition !== 'now' && value.startPosition !== 'resume') {
    throw protocol('listener_frame_invalid', 'resume.startPosition is invalid.')
  }
  requireNullableString(value, 'acceptedCursor')
  requireNullableString(value, 'oldestAvailableCursor')
  requireNullableTimestamp(value, 'cursorExpiresAt')
}

function requireExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const expected = new Set(allowed)
  if (Object.keys(value).some((key) => !expected.has(key))) {
    throw protocol(
      'listener_frame_invalid',
      'A listener frame contains an unknown property.',
    )
  }
}

function requireRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const field = value[key]
  if (!isRecord(field))
    throw protocol('listener_frame_invalid', `${key} must be an object.`)
  return field
}

function requireString(value: Record<string, unknown>, key: string): void {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) {
    throw protocol(
      'listener_frame_invalid',
      `${key} must be a nonempty string.`,
    )
  }
}

function requireTimestamp(value: Record<string, unknown>, key: string): void {
  if (!validTimestamp(value[key])) {
    throw protocol(
      'listener_frame_invalid',
      `${key} must be an RFC 3339 timestamp.`,
    )
  }
}

function requireNullableTimestamp(
  value: Record<string, unknown>,
  key: string,
): void {
  if (value[key] !== null && !validTimestamp(value[key])) {
    throw protocol(
      'listener_frame_invalid',
      `${key} must be an RFC 3339 timestamp or null.`,
    )
  }
}

function requireNullableString(
  value: Record<string, unknown>,
  key: string,
): void {
  if (value[key] !== null && typeof value[key] !== 'string') {
    throw protocol('listener_frame_invalid', `${key} must be a string or null.`)
  }
}

function requireBoolean(value: Record<string, unknown>, key: string): void {
  if (typeof value[key] !== 'boolean') {
    throw protocol('listener_frame_invalid', `${key} must be boolean.`)
  }
}

function requireInteger(
  value: Record<string, unknown>,
  key: string,
  minimum: number,
): void {
  if (!Number.isSafeInteger(value[key]) || (value[key] as number) < minimum) {
    throw protocol('listener_frame_invalid', `${key} must be an integer.`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  )
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function protocol(code: string, message: string): ListenerProtocolError {
  return new ListenerProtocolError(code, message)
}
