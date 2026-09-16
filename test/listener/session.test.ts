import {describe, expect, test, vi} from 'vitest'

import type {ListenerAuthorization} from '../../src/listener/protocol.js'
import {runListener} from '../../src/listener/session.js'
import {ListenerProtocolError} from '../../src/listener/sse.js'

describe('runListener', () => {
  test('waits for output and forwarding before cumulatively acknowledging', async () => {
    const order: string[] = []
    const protocol = fakeProtocol(
      stream([
        frame('ready', ready(), undefined),
        frame('event', event(), 'cursor_1'),
        frame(
          'revoked',
          {
            ...base('revoked', 3),
            lastCursor: 'cursor_1',
            reason: 'principal_revoked',
          },
          undefined,
        ),
      ]),
      order,
    )

    const result = await runListener({
      events: ['message.*'],
      forward: () => {
        order.push('forward')
        return Promise.resolve()
      },
      output: (line) => {
        order.push(line.type === 'event' ? 'output' : line.type)
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
    })

    expect(order.slice(0, 4)).toEqual(['ready', 'output', 'forward', 'ack'])
    expect(protocol.ack).toHaveBeenCalledWith(
      expect.anything(),
      'cursor_1',
      2,
      undefined,
    )
    expect(result).toMatchObject({
      condition: 'authorization',
      lastAcknowledgedCursor: 'cursor_1',
    })
  })

  test('emits the frozen ready JSONL shape instead of the wire frame shape', async () => {
    const protocol = fakeProtocol(
      stream([
        frame('ready', ready(), undefined),
        frame(
          'revoked',
          {
            ...base('revoked', 2),
            lastCursor: null,
            reason: 'principal_revoked',
          },
          undefined,
        ),
      ]),
    )
    const output: Array<Record<string, unknown>> = []

    await runListener({
      events: ['message.*'],
      output: (line) => {
        output.push(line)
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
    })

    const {observedAt, ...readyOutput} = output[0] ?? {}
    expect(typeof observedAt).toBe('string')
    expect(readyOutput).toEqual({
      acceptedCursor: null,
      connectionExpiresAt: '2026-09-08T01:00:00Z',
      filters: {events: ['message.*']},
      listenerId: AUTHORIZATION,
      projectId: PROJECT,
      schemaVersion: 1,
      sequence: 1,
      startPosition: 'now',
      streamId: STREAM,
      type: 'ready',
    })
  })

  test('applies gap policy to a rejected resume cursor before stream open', async () => {
    const protocol = fakeProtocol(stream([]))
    protocol.authorize.mockRejectedValue(
      new ListenerProtocolError('resume_cursor_expired', 'expired', {
        details: {
          cursorExpiresAt: '2026-09-08T00:00:00Z',
          oldestAvailableCursor: null,
          requestedCursor: 'old-cursor',
        },
        safeToReauthorize: true,
        status: 410,
      }),
    )
    const output: Array<Record<string, unknown>> = []

    const result = await runListener({
      events: ['message.*'],
      output: (line) => {
        output.push(line)
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
      resumeCursor: 'old-cursor',
    })

    expect(output.map(({type}) => type)).toEqual(['gap', 'terminal'])
    expect(output[0]).toMatchObject({
      cursorExpiresAt: '2026-09-08T00:00:00Z',
      oldestAvailableCursor: null,
      reason: 'resume_cursor_expired',
      requestedCursor: 'old-cursor',
      sequence: 0,
      streamId: null,
    })
    expect(result.condition).toBe('stream_gap')
    expect(protocol.open).not.toHaveBeenCalled()
  })

  test('reauthorizes after a stream-open error explicitly marked safe', async () => {
    const protocol = fakeProtocol(stream([]))
    protocol.open
      .mockRejectedValueOnce(
        new ListenerProtocolError('listener_credential_expired', 'expired', {
          safeToReauthorize: true,
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        stream([
          frame('ready', ready(), undefined),
          frame(
            'revoked',
            {
              ...base('revoked', 2),
              lastCursor: null,
              reason: 'principal_revoked',
            },
            undefined,
          ),
        ]),
      )

    await expect(
      runListener({
        events: ['message.*'],
        output: () => Promise.resolve(),
        projectId: PROJECT,
        protocol,
        waitBeforeReconnect: () => Promise.resolve(),
      }),
    ).resolves.toMatchObject({condition: 'authorization'})
    expect(protocol.authorize).toHaveBeenCalledTimes(2)
  })

  test('turns an unavailable stream-open resume cursor into a visible gap', async () => {
    const protocol = fakeProtocol(stream([]))
    protocol.open.mockRejectedValue(
      new ListenerProtocolError(
        'listener_cursor_unavailable',
        'cursor unavailable',
        {safeToReauthorize: true, status: 410},
      ),
    )
    const output: Array<Record<string, unknown>> = []

    const result = await runListener({
      events: ['message.*'],
      output: (line) => {
        output.push(line)
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
      resumeCursor: 'old-cursor',
    })

    expect(result.condition).toBe('stream_gap')
    expect(output[0]).toMatchObject({
      oldestAvailableCursor: null,
      reason: 'listener_cursor_unavailable',
      requestedCursor: 'old-cursor',
      type: 'gap',
    })
    expect(protocol.authorize).toHaveBeenCalledOnce()
  })

  test('deduplicates a repeated event by cursor and event ID after reconnect', async () => {
    const protocol = fakeProtocol(stream([]))
    protocol.open
      .mockResolvedValueOnce(
        stream([
          frame('ready', ready(), undefined),
          frame('event', event(), 'cursor_1'),
        ]),
      )
      .mockResolvedValueOnce(
        stream([
          frame('ready', ready(), undefined),
          frame('event', event(), 'cursor_1'),
          frame(
            'revoked',
            {
              ...base('revoked', 3),
              lastCursor: 'cursor_1',
              reason: 'principal_revoked',
            },
            undefined,
          ),
        ]),
      )
    let eventOutputs = 0
    let forwards = 0

    const result = await runListener({
      events: ['message.*'],
      forward: () => {
        forwards += 1
        return Promise.resolve()
      },
      output: (line) => {
        if (line.type === 'event') eventOutputs += 1
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
      waitBeforeReconnect: () => Promise.resolve(),
    })

    expect(result.condition).toBe('authorization')
    expect(eventOutputs).toBe(1)
    expect(forwards).toBe(1)
    expect(protocol.ack).toHaveBeenCalledTimes(2)
  })

  test('fails closed without acknowledging a malformed record', async () => {
    const protocol = fakeProtocol(
      stream([
        frame('ready', ready(), undefined),
        frame('event', {...event(), sequence: 1}, 'cursor_1'),
      ]),
    )

    await expect(
      runListener({
        events: ['*'],
        output: () => Promise.resolve(),
        projectId: PROJECT,
        protocol,
      }),
    ).rejects.toThrow('sequence')
    expect(protocol.ack).not.toHaveBeenCalled()
  })

  test('fails closed when ready does not repeat the authorized project and limits', async () => {
    const protocol = fakeProtocol(
      stream([
        frame(
          'ready',
          {...ready(), projectId: '44444444-4444-4444-8444-444444444444'},
          undefined,
        ),
        frame('event', event(), 'cursor_1'),
      ]),
    )

    await expect(
      runListener({
        events: ['*'],
        output: () => Promise.resolve(),
        projectId: PROJECT,
        protocol,
      }),
    ).rejects.toThrow('authorization')
    expect(protocol.ack).not.toHaveBeenCalled()
  })

  test('reports forwarding failure without acknowledging the event', async () => {
    const protocol = fakeProtocol(
      stream([
        frame('ready', ready(), undefined),
        frame('event', event(), 'cursor_1'),
      ]),
    )

    const result = await runListener({
      events: ['*'],
      forward: () => Promise.reject(new Error('destination failed')),
      output: () => Promise.resolve(),
      projectId: PROJECT,
      protocol,
    })

    expect(result.condition).toBe('forwarding_failed')
    expect(protocol.ack).not.toHaveBeenCalled()
    expect(protocol.close).toHaveBeenCalledWith(
      expect.anything(),
      'forwarding_failed',
      expect.any(AbortSignal),
    )
  })

  test('enforces the negotiated whole-record byte limit without acknowledging', async () => {
    const protocol = fakeProtocol(
      stream([
        frame('ready', ready(), undefined),
        frame('event', event(), 'cursor_1'),
      ]),
      undefined,
      {maxEventBytes: 128},
    )

    await expect(
      runListener({
        events: ['*'],
        maxBuffer: 1,
        output: () => Promise.resolve(),
        projectId: PROJECT,
        protocol,
      }),
    ).rejects.toThrow('maximum')
    expect(protocol.ack).not.toHaveBeenCalled()
  })

  test('rejects an invalid local buffer before requesting authorization', async () => {
    const protocol = fakeProtocol(stream([]))
    await expect(
      runListener({
        events: ['*'],
        maxBuffer: 0,
        output: () => Promise.resolve(),
        projectId: PROJECT,
        protocol,
      }),
    ).rejects.toThrow('1 through 4096')
    expect(protocol.authorize).not.toHaveBeenCalled()
  })

  test('holds at most one decoded event while its active sink is pending', async () => {
    let releaseFirst: (() => void) | undefined
    let observeFirst: (() => void) | undefined
    const firstObserved = new Promise<void>((resolve) => {
      observeFirst = resolve
    })
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const second = {
      ...event(),
      sequence: 3,
      cursor: 'cursor_2',
      event: {...event().event, id: SECOND_EVENT},
    }
    const protocol = fakeProtocol(
      stream([
        frame('ready', ready(), undefined),
        frame('event', event(), 'cursor_1'),
        frame('event', second, 'cursor_2'),
        frame(
          'revoked',
          {
            ...base('revoked', 4),
            lastCursor: 'cursor_2',
            reason: 'principal_revoked',
          },
          undefined,
        ),
      ]),
    )
    const observed: string[] = []

    const running = runListener({
      events: ['*'],
      maxBuffer: 4096,
      output: async (line) => {
        if (line.type !== 'event') return
        observed.push(String(line.cursor))
        if (line.cursor === 'cursor_1') {
          observeFirst?.()
          await firstReleased
        }
      },
      projectId: PROJECT,
      protocol,
    })

    await firstObserved
    await Promise.resolve()
    expect(observed).toEqual(['cursor_1'])
    expect(protocol.ack).not.toHaveBeenCalled()
    releaseFirst?.()
    await expect(running).resolves.toMatchObject({
      acknowledged: 2,
      condition: 'authorization',
    })
    expect(observed).toEqual(['cursor_1', 'cursor_2'])
  })

  test('closes with interrupted and emits a terminal line on local abort', async () => {
    const controller = new AbortController()
    let streamStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      streamStarted = resolve
    })
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(
          new TextEncoder().encode(frame('ready', ready(), undefined)),
        )
        streamStarted?.()
        controller.signal.addEventListener(
          'abort',
          () => streamController.error(new Error('aborted')),
          {once: true},
        )
      },
    })
    const protocol = fakeProtocol(body)
    const output: string[] = []
    const running = runListener({
      events: ['message.*'],
      output: (line) => {
        output.push(line.type)
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
      signal: controller.signal,
    })

    await started
    controller.abort(new Error('interrupted'))

    await expect(running).resolves.toMatchObject({condition: 'interrupted'})
    expect(output).toContain('terminal')
    expect(protocol.close).toHaveBeenCalledWith(
      expect.anything(),
      'interrupted',
      expect.any(AbortSignal),
    )
  })

  test('backs off exponentially across empty reconnects and resets after a delivered frame', async () => {
    const protocol = fakeProtocol(stream([]))
    protocol.open
      .mockResolvedValueOnce(stream([frame('ready', ready(), undefined)]))
      .mockResolvedValueOnce(stream([frame('ready', ready(), undefined)]))
      .mockResolvedValueOnce(
        stream([
          frame('ready', ready(), undefined),
          frame(
            'heartbeat',
            {
              ...base('heartbeat', 2),
              lastCursor: null,
              serverTime: '2026-09-08T00:00:01Z',
            },
            undefined,
          ),
        ]),
      )
      .mockResolvedValueOnce(
        stream([
          frame('ready', ready(), undefined),
          frame(
            'revoked',
            {
              ...base('revoked', 2),
              lastCursor: null,
              reason: 'principal_revoked',
            },
            undefined,
          ),
        ]),
      )
    const attempts: number[] = []

    const result = await runListener({
      events: ['*'],
      output: () => Promise.resolve(),
      projectId: PROJECT,
      protocol,
      waitBeforeReconnect: (attempt) => {
        attempts.push(attempt)
        return Promise.resolve()
      },
    })

    expect(attempts).toEqual([0, 1, 0])
    expect(result.condition).toBe('authorization')
  })

  test('emits an interrupted terminal when aborted during reconnect backoff', async () => {
    const controller = new AbortController()
    const protocol = fakeProtocol(stream([]))
    const output: string[] = []

    const result = await runListener({
      events: ['*'],
      output: (line) => {
        output.push(line.type)
        return Promise.resolve()
      },
      projectId: PROJECT,
      protocol,
      signal: controller.signal,
      waitBeforeReconnect: () => {
        controller.abort(new Error('interrupted'))
        return Promise.resolve()
      },
    })

    expect(result.condition).toBe('interrupted')
    expect(output.at(-1)).toBe('terminal')
    expect(protocol.close).toHaveBeenCalledWith(
      expect.anything(),
      'interrupted',
      expect.any(AbortSignal),
    )
  })
})

const PROJECT = '11111111-1111-4111-8111-111111111111'
const STREAM = '22222222-2222-4222-8222-222222222222'
const AUTHORIZATION = '33333333-3333-4333-8333-333333333333'
const ORGANIZATION = '44444444-4444-4444-8444-444444444444'
const EVENT = '55555555-5555-4555-8555-555555555555'
const SECOND_EVENT = '66666666-6666-4666-8666-666666666666'

function fakeProtocol(
  body: ReadableStream<Uint8Array>,
  order?: string[],
  limits?: Partial<ListenerAuthorization['limits']>,
) {
  const authorization = {
    ackUrl: `https://api.example/v1/cli/listener-streams/${STREAM}/ack`,
    authorizationId: AUTHORIZATION,
    capabilities: {resume: true},
    closeUrl: `https://api.example/v1/cli/listener-streams/${STREAM}/close`,
    credentialExpiresAt: '2026-09-08T01:00:00Z',
    filters: {events: ['message.*']},
    limits: {
      ackTimeoutMs: 30_000,
      heartbeatIntervalMs: 15_000,
      maxEventBytes: 1024,
      maxInFlight: 32,
      ...limits,
    },
    listenerCredential: `pmfa_ls_${'a'.repeat(43)}`,
    mediaType: 'text/event-stream',
    projectId: PROJECT,
    protocolVersion: '1',
    resume: {
      acceptedCursor: null,
      cursorExpiresAt: null,
      oldestAvailableCursor: null,
      startPosition: 'now',
    },
    streamId: STREAM,
    streamUrl: `https://api.example/v1/cli/listener-streams/${STREAM}/events`,
  } satisfies ListenerAuthorization
  return {
    ack: vi.fn(() => {
      order?.push('ack')
      return Promise.resolve()
    }),
    authorize: vi.fn(() => Promise.resolve(authorization)),
    close: vi.fn(() => Promise.resolve()),
    open: vi.fn(() => Promise.resolve(body)),
  }
}

function stream(records: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(records.join('')))
      controller.close()
    },
  })
}

function frame(type: string, data: unknown, id: string | undefined): string {
  return `event: ${type}\n${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(data)}\n\n`
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
    connectionExpiresAt: '2026-09-08T01:00:00Z',
    heartbeatIntervalMs: 15_000,
    maxInFlight: 32,
    projectId: PROJECT,
    resume: {
      acceptedCursor: null,
      cursorExpiresAt: null,
      oldestAvailableCursor: null,
      startPosition: 'now',
    },
  }
}

function event() {
  return {
    ...base('event', 2),
    body: {
      contentType: 'application/json',
      data: 'eyJvayI6dHJ1ZX0=',
      encoding: 'base64',
    },
    cursor: 'cursor_1',
    event: {
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
    },
  }
}
