export interface SseRecord {
  readonly data: string
  readonly event: string
  readonly id?: string
}

export interface ListenerProtocolErrorOptions {
  readonly authorizationRequestId?: string
  readonly details?: Readonly<Record<string, unknown>>
  readonly requestId?: string
  readonly retryAfterMs?: number
  readonly retryable?: boolean
  readonly safeToReauthorize?: boolean
  readonly status?: number
}

export class ListenerProtocolError extends Error {
  readonly code: string
  readonly authorizationRequestId?: string
  readonly details?: Readonly<Record<string, unknown>>
  readonly requestId?: string
  readonly retryAfterMs?: number
  readonly retryable: boolean
  readonly safeToReauthorize: boolean
  readonly status?: number

  constructor(
    code: string,
    message: string,
    options: ListenerProtocolErrorOptions = {},
  ) {
    super(message)
    this.name = 'ListenerProtocolError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.safeToReauthorize = options.safeToReauthorize ?? false
    if (options.authorizationRequestId !== undefined)
      this.authorizationRequestId = options.authorizationRequestId
    if (options.details !== undefined) this.details = options.details
    if (options.requestId !== undefined) this.requestId = options.requestId
    if (options.retryAfterMs !== undefined)
      this.retryAfterMs = options.retryAfterMs
    if (options.status !== undefined) this.status = options.status
  }
}

export async function* decodeSse(
  stream: ReadableStream<Uint8Array>,
  maxRecordBytes: number,
): AsyncGenerator<SseRecord> {
  if (!Number.isSafeInteger(maxRecordBytes) || maxRecordBytes < 1) {
    throw protocol(
      'listener_limit_invalid',
      'The negotiated SSE record limit must be a positive safe integer.',
    )
  }
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})
  const reader = stream.getReader()
  let buffer = ''
  let atStart = true
  let completed = false
  let record = emptyRecord()

  try {
    while (true) {
      const {done, value} = await reader.read()
      let decoded = ''
      try {
        decoded = decoder.decode(value, {stream: !done})
      } catch {
        throw protocol(
          'listener_invalid_utf8',
          'The SSE stream is not valid UTF-8.',
        )
      }

      if (atStart && decoded.length > 0) {
        atStart = false
        if (decoded.startsWith('\uFEFF')) decoded = decoded.slice(1)
      }
      if (decoded.includes('\uFEFF')) {
        throw protocol(
          'listener_invalid_bom',
          'A UTF-8 BOM is allowed only at the beginning of the SSE stream.',
        )
      }
      buffer += decoded

      while (true) {
        const line = takeLine(buffer, done)
        if (line === undefined) break
        buffer = line.remaining
        record.bytes +=
          new TextEncoder().encode(line.value).byteLength + line.separatorBytes
        if (record.bytes > maxRecordBytes) {
          throw protocol(
            'listener_record_too_large',
            `An SSE record exceeded the negotiated maximum of ${maxRecordBytes} bytes.`,
          )
        }

        if (line.value.length === 0) {
          if (record.data.length > 0) {
            yield {
              data: record.data.join('\n'),
              event: record.event ?? 'message',
              ...(record.id === undefined ? {} : {id: record.id}),
            }
          }
          record = emptyRecord()
          continue
        }

        if (line.value.startsWith(':')) continue
        const separator = line.value.indexOf(':')
        const field =
          separator === -1 ? line.value : line.value.slice(0, separator)
        let fieldValue = separator === -1 ? '' : line.value.slice(separator + 1)
        if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1)

        if (field === 'data') record.data.push(fieldValue)
        else if (field === 'event') {
          if (record.event !== undefined) {
            throw protocol(
              'listener_conflicting_event',
              'An SSE record contains duplicate event fields.',
            )
          }
          record.event = fieldValue
        } else if (field === 'id') {
          if (fieldValue.includes('\0')) {
            throw protocol(
              'listener_invalid_id',
              'An SSE id contains a NUL character.',
            )
          }
          if (record.id !== undefined) {
            throw protocol(
              'listener_conflicting_id',
              'An SSE record contains duplicate id fields.',
            )
          }
          record.id = fieldValue
        } else if (field === 'retry') {
          throw protocol(
            'listener_retry_forbidden',
            'The private listener protocol forbids the SSE retry field.',
          )
        }
      }

      if (
        record.bytes + new TextEncoder().encode(buffer).byteLength >
        maxRecordBytes
      ) {
        throw protocol(
          'listener_record_too_large',
          `An SSE record exceeded the negotiated maximum of ${maxRecordBytes} bytes.`,
        )
      }

      if (done) {
        completed = true
        break
      }
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

interface MutableRecord {
  bytes: number
  data: string[]
  event?: string
  id?: string
}

function emptyRecord(): MutableRecord {
  return {bytes: 0, data: []}
}

function takeLine(
  input: string,
  atEnd: boolean,
): {value: string; remaining: string; separatorBytes: number} | undefined {
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character !== '\r' && character !== '\n') continue
    if (character === '\r' && index === input.length - 1 && !atEnd)
      return undefined
    const crlf = character === '\r' && input[index + 1] === '\n'
    return {
      value: input.slice(0, index),
      remaining: input.slice(index + (crlf ? 2 : 1)),
      separatorBytes: crlf ? 2 : 1,
    }
  }
  if (atEnd && input.length > 0) {
    return {value: input, remaining: '', separatorBytes: 0}
  }
  return undefined
}

function protocol(code: string, message: string): ListenerProtocolError {
  return new ListenerProtocolError(code, message)
}
