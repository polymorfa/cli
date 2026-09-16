import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import EventList from '../../src/commands/event/list.js'
import EventReplay from '../../src/commands/event/replay.js'
import EventView from '../../src/commands/event/view.js'
import {withEnvironment} from '../helpers/http-server.js'

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{method: string; values: unknown[]}>,
  responses: [] as unknown[],
}))

vi.mock('@polymorfa/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@polymorfa/sdk')>()

  class Client {
    readonly events = {
      list: (...values: unknown[]) => response('events.list', values),
      replay: (...values: unknown[]) => response('events.replay', values),
      retrieve: (...values: unknown[]) => response('events.retrieve', values),
    }

    project(): this {
      return this
    }
  }

  return {...original, Client}
})

describe('event commands', () => {
  beforeEach(() => {
    sdk.calls.length = 0
    sdk.responses.length = 0
  })

  afterEach(() => vi.restoreAllMocks())

  test('lists project events with filters and the stable page envelope', async () => {
    sdk.responses.push(page([event()], 'cursor_2', true))

    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await environment(() =>
      EventList.run([
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--type',
        'message.received',
        '--since',
        '2026-09-01T00:00:00Z',
        '--until',
        '2026-09-08T00:00:00Z',
        '--limit',
        '20',
        '--json',
      ]),
    )

    expect(sdk.calls).toEqual([
      {
        method: 'events.list',
        values: [
          {
            limit: 20,
            since: '2026-09-01T00:00:00Z',
            type: 'message.received',
            until: '2026-09-08T00:00:00Z',
          },
          {},
        ],
      },
    ])
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({
      schemaVersion: 1,
      data: [event()],
      context: {
        owner: 'project',
        principalType: 'organization_key',
        projectId: '11111111-1111-4111-8111-111111111111',
      },
      request: {apiVersion: '2026-08-20', id: 'req_1', status: 200},
      page: {hasMore: true, nextCursor: 'cursor_2'},
    })
  })

  test('views an organization event and explicitly requests its payload', async () => {
    sdk.responses.push({data: event(), metadata: metadata()})
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    await environment(() =>
      EventView.run([
        'evt_1',
        '--owner',
        'organization',
        '--include-payload',
        '--json',
      ]),
    )

    expect(sdk.calls).toEqual([
      {
        method: 'events.retrieve',
        values: ['evt_1', {includePayload: true}, {}],
      },
    ])
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      schemaVersion: 1,
      data: {id: 'evt_1'},
      context: {owner: 'organization', principalType: 'organization_key'},
      request: {id: 'req_1', status: 200},
    })
  })

  test('rejects cursor and filter combinations before calling the SDK', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await environment(() =>
      EventList.run([
        '--owner',
        'organization',
        '--cursor',
        'cursor_1',
        '--type',
        'message.received',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(sdk.calls).toHaveLength(0)
  })

  test('replays an event with confirmation, retry identity, and an operation receipt', async () => {
    sdk.responses.push({
      data: replayReceipt(),
      metadata: {...metadata(), status: 202},
    })
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    await environment(() =>
      EventReplay.run([
        'evt_1',
        '--webhook',
        'wh_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--yes',
        '--idempotency-key',
        'replay_1',
        '--json',
      ]),
    )

    expect(sdk.calls).toEqual([
      {
        method: 'events.replay',
        values: ['evt_1', {webhookId: 'wh_1'}, {idempotencyKey: 'replay_1'}],
      },
    ])
    const replayed = JSON.parse(String(output.mock.calls[0]?.[0]))
    expect(replayed.operation).toEqual({id: 'operation_1'})
    expect(replayed).toMatchObject({
      schemaVersion: 1,
      resource: {id: 'delivery_1', type: 'webhook_delivery'},
      operation: {id: 'operation_1'},
      idempotency: {key: 'replay_1', receiptId: 'receipt_1', replayed: false},
      result: {deliveryId: 'delivery_1', eventId: 'evt_1'},
      context: {
        owner: 'project',
        projectId: '11111111-1111-4111-8111-111111111111',
      },
      request: {id: 'req_1', status: 202},
    })
  })

  test('does not replay in a noninteractive process without --yes', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await environment(() =>
      EventReplay.run([
        'evt_1',
        '--webhook',
        'wh_1',
        '--owner',
        'organization',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(sdk.calls).toHaveLength(0)
  })
})

function response(method: string, values: unknown[]): Promise<unknown> {
  sdk.calls.push({method, values})
  const value = sdk.responses.shift()
  if (value === undefined) throw new Error(`Missing response for ${method}.`)
  return Promise.resolve(value)
}

function page(
  items: readonly unknown[],
  nextCursor: string | undefined,
  hasMore: boolean,
) {
  return {
    hasMore,
    items,
    nextCursor,
    response: {data: {}, metadata: metadata()},
  }
}

function metadata() {
  return {
    apiVersion: '2026-08-20',
    attempts: 1,
    headers: {},
    requestId: 'req_1',
    status: 200,
  }
}

function event() {
  return {
    createdAt: '2026-09-08T00:00:00Z',
    environment: 'development',
    id: 'evt_1',
    metadataExpiresAt: '2026-10-08T00:00:00Z',
    organizationId: 'org_1',
    payload: null,
    payloadAvailability: 'not_retained',
    projectId: '11111111-1111-4111-8111-111111111111',
    replayableUntil: null,
    source: 'runtime',
    type: 'message.received',
  }
}

function replayReceipt() {
  return {
    deliveryId: 'delivery_1',
    eventId: 'evt_1',
    idempotency: {
      createdAt: '2026-09-08T00:00:00Z',
      expiresAt: '2026-09-09T00:00:00Z',
      id: 'receipt_1',
      key: 'replay_1',
      replayed: false,
    },
    operationId: 'operation_1',
  }
}

function environment<T>(run: () => Promise<T>): Promise<T> {
  return withEnvironment(
    {
      POLYMORFA_API_KEY:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_BASE_URL: 'https://api.example.test',
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_PROJECT_TOKEN: undefined,
    },
    run,
  )
}

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error)) {
    return undefined
  }
  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
