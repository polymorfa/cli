import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import OperationCancel from '../../src/commands/operation/cancel.js'
import OperationList from '../../src/commands/operation/list.js'
import OperationView from '../../src/commands/operation/view.js'
import OperationWait from '../../src/commands/operation/wait.js'
import OperationWatch from '../../src/commands/operation/watch.js'
import {withEnvironment} from '../helpers/http-server.js'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OPERATION = '00000000-0000-4000-8000-000000000099'

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{kind: string; request: Record<string, unknown>}>,
  responses: [] as unknown[],
}))

vi.mock('@polymorfa/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@polymorfa/sdk')>()

  class Client {
    projectId: string | null = null
    readonly raw = {
      paginate: (
        request: Record<string, unknown>,
        decode: (d: unknown) => {items: unknown[]; nextCursor?: string | null},
      ) => {
        sdk.calls.push({kind: 'paginate', request})
        const body = next()
        const decoded = decode(body)
        return Promise.resolve({
          hasMore: Boolean(decoded.nextCursor),
          items: decoded.items,
          nextCursor: decoded.nextCursor ?? undefined,
          response: {data: body, metadata: metadata()},
        })
      },
      request: (request: Record<string, unknown>) => {
        sdk.calls.push({kind: 'request', request})
        return Promise.resolve({data: next(), metadata: metadata()})
      },
    }

    project(projectId: string): Client {
      const scoped = new Client()
      scoped.projectId = projectId
      return scoped
    }
  }

  return {...original, Client}
})

function next(): unknown {
  const value = sdk.responses.shift()
  if (value === undefined) throw new Error('Missing response.')
  return value
}

describe('operation commands', () => {
  beforeEach(() => {
    sdk.calls.length = 0
    sdk.responses.length = 0
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  test('lists organization operations with filters', async () => {
    sdk.responses.push({
      data: [operation('running', 2)],
      page: {nextCursor: null},
    })
    const output = silence()
    await environment(() =>
      OperationList.run([
        '--owner',
        'organization',
        '--status',
        'running',
        '--resource-type',
        'campaign',
        '--resource-id',
        'c1',
        '--json',
      ]),
    )
    expect(sdk.calls[0]?.request).toMatchObject({
      method: 'GET',
      path: '/platform/operations',
      query: {
        limit: 25,
        resourceId: 'c1',
        resourceType: 'campaign',
        status: 'running',
      },
    })
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      data: [{id: OPERATION, status: 'running'}],
      schemaVersion: 1,
    })
  })

  test('views a project operation on the project route', async () => {
    sdk.responses.push({data: operation('running', 2)})
    const output = silence()
    await environment(() =>
      OperationView.run([
        OPERATION,
        '--owner',
        'project',
        '--project',
        PROJECT,
      ]),
    )
    expect(sdk.calls[0]?.request).toMatchObject({
      method: 'GET',
      path: `/platform/projects/${PROJECT}/operations/${OPERATION}`,
    })
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('')
    expect(text).toContain('Status\trunning')
    expect(text).toContain('Cancellable\tyes')
  })

  test('waits with server long-polls and exits 0 on success', async () => {
    sdk.responses.push(
      {data: operation('running', 2)},
      {data: operation('succeeded', 3)},
    )
    silence()
    await environment(() =>
      OperationWait.run([
        OPERATION,
        '--owner',
        'organization',
        '--timeout',
        '120',
        '--json',
      ]),
    )
    expect(sdk.calls.map((call) => call.request.query)).toEqual([
      {wait: 30},
      {wait: 30},
    ])
    expect(sdk.calls[0]?.request.timeoutMs).toBe(45_000)
    expect(process.exitCode).toBeUndefined()
  })

  test('exits 1 when the operation fails', async () => {
    sdk.responses.push({data: operation('failed', 3)})
    silence()
    await environment(() =>
      OperationWait.run([OPERATION, '--owner', 'organization', '--json']),
    )
    expect(process.exitCode).toBe(1)
  })

  test('exits 8 when the timeout ends first', async () => {
    sdk.responses.push({data: operation('running', 2)})
    silence()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      OperationWait.run([
        OPERATION,
        '--owner',
        'organization',
        '--timeout',
        '0',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(8)
    expect(sdk.calls[0]?.request.query).toEqual({wait: 0})
  })

  test('watch prints each new sequence until terminal', async () => {
    sdk.responses.push(
      {data: operation('running', 2)},
      {data: operation('cancelling', 3)},
      {data: operation('cancelled', 4)},
    )
    const output = silence()
    await environment(() =>
      OperationWatch.run([OPERATION, '--owner', 'organization']),
    )
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('')
    expect(text).toContain('\trunning\t')
    expect(text).toContain('\tcancelling\t')
    expect(text).toContain('\tcancelled\t')
    expect(sdk.calls[1]?.request.query).toMatchObject({afterSequence: 2})
    expect(process.exitCode).toBe(1)
  })

  test('cancels with confirmation and a caller idempotency key', async () => {
    sdk.responses.push({
      data: {
        idempotency: {id: 'receipt_1', key: 'cancel_1', replayed: false},
        operation: operation('cancelling', 3),
        operationId: OPERATION,
      },
    })
    const output = silence()
    await environment(() =>
      OperationCancel.run([
        OPERATION,
        '--owner',
        'organization',
        '--yes',
        '--idempotency-key',
        'cancel_1',
        '--json',
      ]),
    )
    expect(sdk.calls[0]?.request).toMatchObject({
      idempotencyKey: 'cancel_1',
      method: 'POST',
      path: `/platform/operations/${OPERATION}/cancel`,
    })
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      idempotency: {key: 'cancel_1', replayed: false},
      resource: {id: OPERATION, type: 'operation'},
    })
  })

  test('does not cancel without --yes in a noninteractive process', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      OperationCancel.run([OPERATION, '--owner', 'organization', '--json']),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(2)
    expect(sdk.calls).toHaveLength(0)
  })
})

function silence() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

function operation(status: string, sequence: number) {
  return {
    actionRequired: null,
    capabilities: {cancellable: status === 'running', watchable: true},
    completedAt: null,
    createdAt: '2026-09-19T00:00:00Z',
    error: null,
    id: OPERATION,
    kind: 'campaign',
    organizationId: 'org_1',
    progress: null,
    projectId: PROJECT,
    resource: {id: 'c1', type: 'campaign'},
    result: null,
    sequence,
    status,
    updatedAt: '2026-09-19T00:00:00Z',
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
