import {describe, expect, test} from 'vitest'

import {ListenerFrameDecoder} from '../../src/listener/frames.js'

describe('ListenerFrameDecoder', () => {
  test('accepts a ready frame followed by an event with matching cursor', () => {
    const decoder = new ListenerFrameDecoder(STREAM)
    expect(decoder.decode(record('ready', ready()))).toMatchObject({
      type: 'ready',
    })
    expect(
      decoder.decode(
        record(
          'event',
          {
            ...base('event', 2),
            body: {
              contentType: 'application/json',
              data: 'e30=',
              encoding: 'base64',
            },
            cursor: 'cursor_1',
            event: eventMetadata(),
          },
          'cursor_1',
        ),
      ),
    ).toMatchObject({cursor: 'cursor_1', sequence: 2, type: 'event'})
  })

  test('fails closed on wrong first type, sequence, stream, event name, and id', () => {
    expect(() =>
      new ListenerFrameDecoder(STREAM).decode(
        record('heartbeat', {
          ...base('heartbeat', 1),
          lastCursor: null,
          serverTime: 'x',
        }),
      ),
    ).toThrow('first')

    const decoder = new ListenerFrameDecoder(STREAM)
    decoder.decode(record('ready', ready()))
    expect(() =>
      decoder.decode(
        record('heartbeat', {
          ...base('heartbeat', 1),
          lastCursor: null,
          serverTime: 'x',
        }),
      ),
    ).toThrow('sequence')
    expect(() =>
      new ListenerFrameDecoder(STREAM).decode(
        record('ready', {...ready(), streamId: 'stream_2'}),
      ),
    ).toThrow('stream')
    expect(() =>
      new ListenerFrameDecoder(STREAM).decode(record('unknown', ready())),
    ).toThrow('event name')
    expect(() =>
      new ListenerFrameDecoder(STREAM).decode(
        record('ready', ready(), 'cursor'),
      ),
    ).toThrow('must omit')
  })

  test('rejects malformed timestamps, cursors, event metadata, and encoded bodies', () => {
    expect(() =>
      new ListenerFrameDecoder(STREAM).decode(
        record('ready', {...ready(), sentAt: 'later'}),
      ),
    ).toThrow('sentAt')

    const heartbeatDecoder = startedDecoder()
    expect(() =>
      heartbeatDecoder.decode(
        record('heartbeat', {
          ...base('heartbeat', 2),
          cursor: 'forbidden',
          lastCursor: null,
          serverTime: '2026-09-08T00:00:00Z',
        }),
      ),
    ).toThrow('unknown property')

    const metadataDecoder = startedDecoder()
    expect(() =>
      metadataDecoder.decode(
        record(
          'event',
          {
            ...base('event', 2),
            body: {
              contentType: 'application/json',
              data: 'e30=',
              encoding: 'base64',
            },
            cursor: 'cursor_1',
            event: {id: 'event_1', type: 'message.received'},
          },
          'cursor_1',
        ),
      ),
    ).toThrow('organizationId')

    const bodyDecoder = startedDecoder()
    expect(() =>
      bodyDecoder.decode(
        record(
          'event',
          {
            ...base('event', 2),
            body: {
              contentType: 'application/json',
              data: 'not base64',
              encoding: 'base64',
            },
            cursor: 'cursor_1',
            event: eventMetadata(),
          },
          'cursor_1',
        ),
      ),
    ).toThrow('body')
  })

  test('accepts only the pinned unavailable and revocation reasons', () => {
    for (const [payloadAvailability, reason] of [
      ['not_retained', 'not_retained'],
      ['redacted', 'redacted'],
    ] as const) {
      const decoder = startedDecoder()
      expect(
        decoder.decode(
          record(
            'event_unavailable',
            {
              ...base('event_unavailable', 2),
              cursor: 'cursor_1',
              event: {...eventMetadata(), payloadAvailability},
              payloadAvailability,
              reason,
            },
            'cursor_1',
          ),
        ),
      ).toMatchObject({reason})
    }
    const decoder = startedDecoder()
    expect(
      decoder.decode(
        record('revoked', {
          ...base('revoked', 2),
          lastCursor: null,
          reason: 'principal_revoked',
        }),
      ),
    ).toMatchObject({reason: 'principal_revoked'})

    expect(() =>
      startedDecoder().decode(
        record('revoked', {
          ...base('revoked', 2),
          lastCursor: null,
          reason: 'scope_revoked',
        }),
      ),
    ).toThrow('revoked')
  })

  test('rejects unknown top-level and nested frame properties', () => {
    expect(() =>
      new ListenerFrameDecoder(STREAM).decode(
        record('ready', {...ready(), extra: 'not in the schema'}),
      ),
    ).toThrow('unknown')

    const decoder = startedDecoder()
    expect(() =>
      decoder.decode(
        record(
          'event',
          {
            ...base('event', 2),
            body: {
              contentType: 'application/json',
              data: 'e30=',
              encoding: 'base64',
            },
            cursor: 'cursor_1',
            event: {...eventMetadata(), secret: 'must not pass through'},
          },
          'cursor_1',
        ),
      ),
    ).toThrow('unknown')
  })
})

function startedDecoder() {
  const decoder = new ListenerFrameDecoder(STREAM)
  decoder.decode(record('ready', ready()))
  return decoder
}

function eventMetadata() {
  return {
    createdAt: '2026-09-08T00:00:00Z',
    environment: 'development',
    id: EVENT,
    metadataExpiresAt: '2026-10-08T00:00:00Z',
    organizationId: ORGANIZATION,
    payloadAvailability: 'available',
    projectId: PROJECT,
    replayableUntil: null,
    source: 'runtime',
    type: 'message.received',
  }
}

function record(event: string, data: unknown, id?: string) {
  return {data: JSON.stringify(data), event, ...(id === undefined ? {} : {id})}
}

function base(type: string, sequence: number) {
  return {
    sentAt: '2026-09-08T00:00:00Z',
    sequence,
    streamId: STREAM,
    type,
    v: 1,
  }
}

function ready() {
  return {
    ...base('ready', 1),
    connectionExpiresAt: '2026-09-08T00:30:00Z',
    heartbeatIntervalMs: 15_000,
    maxInFlight: 256,
    projectId: PROJECT,
    resume: {
      acceptedCursor: null,
      cursorExpiresAt: null,
      oldestAvailableCursor: null,
      startPosition: 'now',
    },
  }
}

const STREAM = '22222222-2222-4222-8222-222222222222'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const ORGANIZATION = '33333333-3333-4333-8333-333333333333'
const EVENT = '44444444-4444-4444-8444-444444444444'
