import {describe, expect, test, vi} from 'vitest'

import {
  type ListenerAuthorization,
  ListenerProtocolClient,
} from '../../src/listener/protocol.js'

describe('ListenerProtocolClient', () => {
  test('keeps durable and one-use credentials on their exact requests', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(201, authorization()))
      .mockResolvedValueOnce(
        new Response('event: ready\ndata: {}\n\n', {
          headers: {'content-type': 'text/event-stream'},
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          data: {
            acknowledgedCursor: 'c1',
            replayed: false,
            sequence: 2,
            streamId: STREAM,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {data: {closed: true, streamId: STREAM}}),
      )
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'pmfa_pk_primary',
      fetch,
      version: '0.1.0-dev.0',
    })

    const auth = await client.authorize({
      events: ['message.*'],
      projectId: PROJECT,
      resumeCursor: null,
    })
    await client.open(auth)
    await client.ack(auth, 'c1', 2)
    await client.close(auth, 'interrupted')

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(headers(fetch.mock.calls[0]?.[1]).authorization).toBe(
      'Bearer pmfa_pk_primary',
    )
    expect(headers(fetch.mock.calls[1]?.[1]).authorization).toBe(
      `Bearer ${LISTENER}`,
    )
    expect(headers(fetch.mock.calls[2]?.[1]).authorization).toBe(
      'Bearer pmfa_pk_primary',
    )
    expect(headers(fetch.mock.calls[3]?.[1]).authorization).toBe(
      'Bearer pmfa_pk_primary',
    )
    for (const [, init] of fetch.mock.calls) {
      expect(init?.redirect).toBe('manual')
      expect(headers(init)['idempotency-key']).toBeUndefined()
      expect(headers(init).cookie).toBeUndefined()
    }
  })

  test('rejects foreign or credential-bearing response URLs before stream use', async () => {
    const response = authorization()
    response.data.streamUrl = `https://evil.example/v1/cli/listener-streams/${STREAM}/events`
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'primary',
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(json(201, response)),
      version: '0.1.0-dev.0',
    })
    await expect(
      client.authorize({
        events: ['message.*'],
        projectId: PROJECT,
        resumeCursor: null,
      }),
    ).rejects.toThrow('trusted API origin')
  })

  test('rejects an authorization whose identity, filters, resume, timestamps, or limits do not match', async () => {
    const cases: Array<(data: Record<string, unknown>) => void> = [
      (data) => {
        data.authorizationId = 'not-a-uuid'
      },
      (data) => {
        data.projectId = '44444444-4444-4444-8444-444444444444'
      },
      (data) => {
        data.filters = {events: ['call.*']}
      },
      (data) => {
        data.resume = {...(data.resume as object), acceptedCursor: 'unexpected'}
      },
      (data) => {
        data.credentialExpiresAt = 'tomorrow'
      },
      (data) => {
        data.capabilities = {resume: false}
      },
      (data) => {
        data.limits = {...(data.limits as object), maxInFlight: 0}
      },
      (data) => {
        data.limits = {...(data.limits as object), maxEventBytes: 16_777_217}
      },
      (data) => {
        data.limits = {...(data.limits as object), heartbeatIntervalMs: 999}
      },
      (data) => {
        data.limits = {...(data.limits as object), ackTimeoutMs: 1_999}
      },
      (data) => {
        data.unexpected = true
      },
    ]

    for (const mutate of cases) {
      const response = authorization()
      mutate(response.data)
      const client = new ListenerProtocolClient({
        apiOrigin: 'https://api.example.test',
        credential: 'primary',
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(json(201, response)),
        version: '0.1.0-dev.0',
      })
      await expect(
        client.authorize({
          events: ['message.*'],
          projectId: PROJECT,
          resumeCursor: null,
        }),
      ).rejects.toMatchObject({code: 'listener_authorization_invalid'})
    }
  })

  test('accepts every authorization limit boundary from the pinned schema', async () => {
    const response = authorization()
    response.data.filters = {events: ['*']}
    response.data.limits = {
      ackTimeoutMs: 2_000,
      heartbeatIntervalMs: 1_000,
      maxEventBytes: 16_777_216,
      maxInFlight: 4_096,
    }
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'primary',
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(json(201, response)),
      version: '0.1.0-dev.0',
    })

    await expect(
      client.authorize({events: ['*'], projectId: PROJECT, resumeCursor: null}),
    ).resolves.toMatchObject({limits: response.data.limits})
  })

  test('retries one authorization attempt with the same request ID', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('socket reset'))
      .mockResolvedValueOnce(
        json(
          503,
          listenerError('listener_authorization_unavailable', true, true),
          {'retry-after': '0'},
        ),
      )
      .mockResolvedValueOnce(json(201, authorization()))
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'primary',
      fetch,
      version: '0.1.0-dev.0',
    })

    await client.authorize({
      events: ['message.*'],
      projectId: PROJECT,
      resumeCursor: null,
    })

    const requestIds = fetch.mock.calls.map((call) =>
      authorizationRequestId(call[1]),
    )
    expect(requestIds).toHaveLength(3)
    expect(new Set(requestIds).size).toBe(1)
  })

  test('validates ACK and close responses and retries an ambiguous ACK', async () => {
    const auth = authorization().data as ListenerAuthorization
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('socket reset'))
      .mockResolvedValueOnce(
        json(200, {
          data: {
            acknowledgedCursor: 'c1',
            replayed: true,
            sequence: 2,
            streamId: STREAM,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {data: {closed: true, streamId: 'wrong'}}),
      )
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'primary',
      fetch,
      version: '0.1.0-dev.0',
    })

    await expect(client.ack(auth, 'c1', 2)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
    await expect(client.close(auth, 'interrupted')).rejects.toMatchObject({
      code: 'listener_response_invalid',
    })
  })

  test('preserves status, retry metadata, and a header request ID', async () => {
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'primary',
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        json(403, listenerError('project_access_denied', false, false), {
          'x-request-id': 'req_listener',
        }),
      ),
      version: '0.1.0-dev.0',
    })

    await expect(
      client.authorize({
        events: ['*'],
        projectId: PROJECT,
        resumeCursor: null,
      }),
    ).rejects.toMatchObject({
      code: 'project_access_denied',
      requestId: 'req_listener',
      retryable: false,
      safeToReauthorize: false,
      status: 403,
    })
  })

  test('rejects plaintext localhost when DNS includes a non-loopback address', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new ListenerProtocolClient({
      apiOrigin: 'http://localhost:8787',
      credential: 'primary',
      fetch,
      lookup: () =>
        Promise.resolve([
          {address: '127.0.0.1', family: 4},
          {address: '203.0.113.1', family: 4},
        ]),
      version: '0.1.0-dev.0',
    })

    await expect(
      client.authorize({events: ['*'], projectId: PROJECT, resumeCursor: null}),
    ).rejects.toMatchObject({code: 'listener_origin_invalid'})
    expect(fetch).not.toHaveBeenCalled()
  })

  test('rejects a non-UUID project before sending durable credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new ListenerProtocolClient({
      apiOrigin: 'https://api.example.test',
      credential: 'primary',
      fetch,
      version: '0.1.0-dev.0',
    })

    await expect(
      client.authorize({
        events: ['*'],
        projectId: 'project-slug',
        resumeCursor: null,
      }),
    ).rejects.toMatchObject({code: 'listener_authorization_invalid'})
    expect(fetch).not.toHaveBeenCalled()
  })

  test('rejects an API origin with a path before constructing listener URLs', () => {
    expect(
      () =>
        new ListenerProtocolClient({
          apiOrigin: 'https://api.example.test/prefix',
          credential: 'primary',
          fetch: vi.fn<typeof globalThis.fetch>(),
          version: '0.1.0-dev.0',
        }),
    ).toThrow('origin')
  })

  test('describes the loopback-only plaintext exception for unsupported schemes', () => {
    expect(
      () =>
        new ListenerProtocolClient({
          apiOrigin: 'ftp://api.example.test',
          credential: 'primary',
          fetch: vi.fn<typeof globalThis.fetch>(),
          version: '0.1.0-dev.0',
        }),
    ).toThrow(
      'must use HTTPS, or HTTP with a host that resolves only to loopback addresses',
    )
  })
})

const PROJECT = '11111111-1111-4111-8111-111111111111'
const STREAM = '22222222-2222-4222-8222-222222222222'
const AUTH = '33333333-3333-4333-8333-333333333333'
const LISTENER = `pmfa_ls_${'a'.repeat(43)}`

function authorization() {
  return {
    data: {
      ackUrl: `https://api.example.test/v1/cli/listener-streams/${STREAM}/ack`,
      authorizationId: AUTH,
      capabilities: {resume: true},
      closeUrl: `https://api.example.test/v1/cli/listener-streams/${STREAM}/close`,
      credentialExpiresAt: '2026-09-08T01:00:00Z',
      filters: {events: ['message.*']},
      limits: {
        ackTimeoutMs: 30_000,
        heartbeatIntervalMs: 15_000,
        maxEventBytes: 65_536,
        maxInFlight: 32,
      },
      listenerCredential: LISTENER,
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
      streamUrl: `https://api.example.test/v1/cli/listener-streams/${STREAM}/events`,
    },
  }
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    headers: {'content-type': 'application/json', ...headers},
    status,
  })
}

function listenerError(code: string, retryable: boolean, safe: boolean) {
  return {
    error: {
      code,
      details: {},
      message: code,
      retryable,
      safeToReauthorize: safe,
    },
  }
}

function headers(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries())
}

function authorizationRequestId(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') throw new Error('missing request body')
  const body: unknown = JSON.parse(init.body)
  if (
    typeof body !== 'object' ||
    body === null ||
    !('authorizationRequestId' in body) ||
    typeof body.authorizationRequestId !== 'string'
  ) {
    throw new Error('missing authorization request ID')
  }
  return body.authorizationRequestId
}
