import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import OperationCancel from '../../src/commands/operation/cancel.js'
import OperationList from '../../src/commands/operation/list.js'
import OperationView from '../../src/commands/operation/view.js'
import OperationWait from '../../src/commands/operation/wait.js'
import OperationWatch from '../../src/commands/operation/watch.js'
import {withEnvironment} from '../helpers/http-server.js'

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{method: string; values: unknown[]}>,
  responses: [] as unknown[],
}))

vi.mock('@polymorfa/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@polymorfa/sdk')>()

  class Client {
    readonly operations = {
      cancel: (...values: unknown[]) => response('operations.cancel', values),
      list: (...values: unknown[]) => response('operations.list', values),
      listTransitions: (...values: unknown[]) =>
        response('operations.listTransitions', values),
      retrieve: (...values: unknown[]) =>
        response('operations.retrieve', values),
      wait: (...values: unknown[]) => response('operations.wait', values),
    }

    project(): this {
      return this
    }
  }

  return {...original, Client}
})

describe('operation commands', () => {
  beforeEach(() => {
    sdk.calls.length = 0
    sdk.responses.length = 0
  })

  afterEach(() => vi.restoreAllMocks())

  test('lists operations with owner, lifecycle, resource, and time filters', async () => {
    sdk.responses.push(page([operation('running')]))
    const output = stdout()

    await environment(() =>
      OperationList.run([
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--status',
        'running',
        '--kind',
        'webhook_redrive',
        '--resource',
        'webhook_delivery:delivery_1',
        '--since',
        '2026-09-01T00:00:00Z',
        '--until',
        '2026-09-08T00:00:00Z',
        '--limit',
        '10',
        '--json',
      ]),
    )

    expect(sdk.calls).toEqual([
      {
        method: 'operations.list',
        values: [
          {
            kind: 'webhook_redrive',
            limit: 10,
            resourceId: 'delivery_1',
            resourceType: 'webhook_delivery',
            since: '2026-09-01T00:00:00Z',
            status: 'running',
            until: '2026-09-08T00:00:00Z',
          },
          {},
        ],
      },
    ])
    expect(json(output)).toMatchObject({
      schemaVersion: 1,
      data: [{id: 'operation_1', status: 'running'}],
      context: {
        owner: 'project',
        projectId: '11111111-1111-4111-8111-111111111111',
      },
      request: {id: 'req_1', status: 200},
      page: {hasMore: false, nextCursor: null},
    })
  })

  test('views an operation through the explicit owner without a surface switch', async () => {
    sdk.responses.push({data: operation('running'), metadata: metadata()})
    const output = stdout()

    await environment(() =>
      OperationView.run(['operation_1', '--owner', 'organization', '--json']),
    )

    expect(sdk.calls).toEqual([
      {
        method: 'operations.retrieve',
        values: ['operation_1', {}],
      },
    ])
    expect(json(output)).toMatchObject({
      schemaVersion: 1,
      data: {id: 'operation_1', status: 'running'},
      context: {owner: 'organization'},
      request: {id: 'req_1', status: 200},
    })
  })

  test('rejects the removed ambiguous --surface flag', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await environment(() =>
      OperationView.run([
        'operation_1',
        '--owner',
        'organization',
        '--surface',
        'platform',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(sdk.calls).toHaveLength(0)
  })

  test('waits locally without cancelling and exits with the failed-operation condition', async () => {
    sdk.responses.push({data: operation('failed'), metadata: metadata()})
    const output = stdout()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await environment(() =>
      OperationWait.run([
        'operation_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--timeout',
        '30s',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(6)
    expect(sdk.calls).toHaveLength(1)
    expect(sdk.calls[0]?.method).toBe('operations.wait')
    expect(sdk.calls[0]?.values[0]).toBe('operation_1')
    expect(sdk.calls[0]?.values[1]).toMatchObject({
      maxWaitMs: 30_000,
      requestOptions: {},
    })
    expect(
      (sdk.calls[0]?.values[1] as Readonly<Record<string, unknown>>).signal,
    ).toBeInstanceOf(AbortSignal)
    expect(json(output)).toMatchObject({
      schemaVersion: 1,
      data: {id: 'operation_1', status: 'failed'},
      context: {owner: 'project'},
    })
  })

  test('cancels after confirmation and preserves the returned operation receipt', async () => {
    sdk.responses.push({
      data: cancellationReceipt(),
      metadata: {...metadata(), status: 202},
    })
    const output = stdout()

    await environment(() =>
      OperationCancel.run([
        'operation_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--yes',
        '--idempotency-key',
        'cancel_1',
        '--json',
      ]),
    )

    expect(sdk.calls).toEqual([
      {
        method: 'operations.cancel',
        values: ['operation_1', {idempotencyKey: 'cancel_1'}],
      },
    ])
    expect(json(output)).toMatchObject({
      schemaVersion: 1,
      resource: {id: 'operation_1', type: 'operation'},
      operation: {
        id: 'operation_1',
        statusUrl:
          'https://api.example.test/v1/projects/11111111-1111-4111-8111-111111111111/operations/operation_1',
      },
      idempotency: {key: 'cancel_1', receiptId: 'receipt_1', replayed: false},
      result: {operation: {id: 'operation_1', status: 'cancelling'}},
    })
  })

  test('does not cancel in a noninteractive process without --yes', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await environment(() =>
      OperationCancel.run(['operation_1', '--owner', 'organization', '--json']),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(sdk.calls).toHaveLength(0)
  })

  test('watches transition pages as JSONL and exits with the terminal condition', async () => {
    sdk.responses.push(
      page([
        {
          actionRequired: null,
          error: {code: 'delivery_failed', details: null, retryable: false},
          fromStatus: 'running',
          occurredAt: '2026-09-08T00:00:01Z',
          operationId: 'operation_1',
          progress: null,
          reasonCode: 'delivery_failed',
          sequence: 3,
          snapshot: {
            actionRequired: null,
            error: {code: 'delivery_failed', details: null, retryable: false},
            progress: null,
          },
          toStatus: 'failed',
        },
      ]),
      {data: operation('failed'), metadata: metadata()},
    )
    const output = stdout()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await environment(() =>
      OperationWatch.run([
        'operation_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--from-sequence',
        '2',
        '--timeout',
        '30s',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(6)
    expect(sdk.calls).toHaveLength(2)
    expect(sdk.calls[0]?.method).toBe('operations.listTransitions')
    expect(sdk.calls[0]?.values.slice(0, 2)).toEqual([
      'operation_1',
      {afterSequence: 2, limit: 100},
    ])
    expect(sdk.calls[1]?.method).toBe('operations.retrieve')
    expect(sdk.calls[1]?.values[0]).toBe('operation_1')
    expect(
      (sdk.calls[0]?.values[2] as Readonly<Record<string, unknown>>).signal,
    ).toBeInstanceOf(AbortSignal)
    expect(
      (sdk.calls[1]?.values[1] as Readonly<Record<string, unknown>>).signal,
    ).toBeInstanceOf(AbortSignal)
    const lines = output.mock.calls.map(
      ([value]) =>
        JSON.parse(String(value)) as Readonly<Record<string, unknown>>,
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      schemaVersion: 1,
      type: 'transition',
      operationId: 'operation_1',
      sequence: 3,
      context: {
        owner: 'project',
        projectId: '11111111-1111-4111-8111-111111111111',
      },
      request: {id: 'req_1', status: 200},
    })
    expect(lines[1]).toMatchObject({
      schemaVersion: 1,
      type: 'terminal',
      condition: 'failed',
      lastSequence: 3,
      operation: {id: 'operation_1', status: 'failed'},
      request: {id: 'req_1', status: 200},
    })
  })
})

function response(method: string, values: unknown[]): Promise<unknown> {
  sdk.calls.push({method, values})
  const value = sdk.responses.shift()
  if (value === undefined) throw new Error(`Missing response for ${method}.`)
  return Promise.resolve(value)
}

function page(items: readonly unknown[], nextCursor?: string) {
  return {
    hasMore: nextCursor !== undefined,
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

function operation(status: string) {
  return {
    actionRequired: null,
    capabilities: {cancellable: true, watchable: true},
    completedAt: null,
    createdAt: '2026-09-08T00:00:00Z',
    error: null,
    id: 'operation_1',
    kind: 'webhook_redrive',
    organizationId: 'org_1',
    progress: null,
    projectId: '11111111-1111-4111-8111-111111111111',
    resource: {id: 'delivery_1', type: 'webhook_delivery'},
    result: null,
    sequence: 2,
    status,
    updatedAt: '2026-09-08T00:00:01Z',
  }
}

function cancellationReceipt() {
  return {
    idempotency: {
      createdAt: '2026-09-08T00:00:00Z',
      expiresAt: '2026-09-09T00:00:00Z',
      id: 'receipt_1',
      key: 'cancel_1',
      replayed: false,
    },
    operation: operation('cancelling'),
    operationId: 'operation_1',
  }
}

function stdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

function json(
  output: ReturnType<typeof stdout>,
): Readonly<Record<string, unknown>> {
  return JSON.parse(String(output.mock.calls[0]?.[0])) as Readonly<
    Record<string, unknown>
  >
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
