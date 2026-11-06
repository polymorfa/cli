import {createServer, type IncomingHttpHeaders, type Server} from 'node:http'

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

import OperationCancel from '../../src/commands/operation/cancel.js'
import OperationList from '../../src/commands/operation/list.js'
import OperationView from '../../src/commands/operation/view.js'
import OperationWait from '../../src/commands/operation/wait.js'
import OperationWatch from '../../src/commands/operation/watch.js'
import {withEnvironment} from '../helpers/http-server.js'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OPERATION = '00000000-0000-4000-8000-000000000099'

interface Captured {
  readonly headers: IncomingHttpHeaders
  readonly method: string
  readonly path: string
  readonly query: Record<string, string>
}

const HANG = Symbol('hang')
type Reply = unknown

const api = {
  calls: [] as Captured[],
  closedEarly: 0,
  responses: [] as Reply[],
  server: undefined as Server | undefined,
  url: '',
}

function next(): Reply {
  const value = api.responses.shift()
  if (value === undefined) throw new Error('Missing response.')
  return value
}

describe('operation commands', () => {
  beforeAll(async () => {
    api.server = createServer((request, reply) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      api.calls.push({
        headers: request.headers,
        method: request.method ?? '',
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      })
      let body: Reply
      try {
        body = next()
      } catch {
        reply.writeHead(500).end()
        return
      }
      if (body === HANG) {
        request.socket.once('close', () => (api.closedEarly += 1))
        return
      }
      reply.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': 'req_1',
      })
      reply.end(JSON.stringify(body))
    })
    await new Promise<void>((resolve) =>
      api.server?.listen(0, '127.0.0.1', resolve),
    )
    const address = api.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Test server did not bind.')
    }
    api.url = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    api.server?.closeAllConnections()
    await new Promise((resolve) => api.server?.close(resolve))
  })

  beforeEach(() => {
    api.calls.length = 0
    api.closedEarly = 0
    api.responses.length = 0
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  test('lists organization operations with filters', async () => {
    api.responses.push({
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
    expect(api.calls[0]).toMatchObject({
      method: 'GET',
      path: '/platform/operations',
      query: {
        limit: '25',
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
    api.responses.push({data: operation('running', 2)})
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
    expect(api.calls[0]).toMatchObject({
      method: 'GET',
      path: `/platform/projects/${PROJECT}/operations/${OPERATION}`,
    })
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('')
    expect(text).toContain('Status\trunning')
    expect(text).toContain('Cancellable\tyes')
  })

  test('waits with server long-polls and exits 0 on success', async () => {
    api.responses.push(
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
    expect(api.calls.map((call) => call.query)).toEqual([
      {wait: '30'},
      {wait: '30'},
    ])
    expect(process.exitCode).toBeUndefined()
  })

  test('exits 1 when the operation fails', async () => {
    api.responses.push({data: operation('failed', 3)})
    silence()
    await environment(() =>
      OperationWait.run([OPERATION, '--owner', 'organization', '--json']),
    )
    expect(process.exitCode).toBe(1)
  })

  test('exits 8 when the timeout ends first', async () => {
    api.responses.push({data: operation('running', 2)})
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
    expect(api.calls[0]?.query).toEqual({wait: '0'})
  })

  test('watch prints each new sequence until terminal', async () => {
    api.responses.push(
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
    expect(api.calls[1]?.query).toMatchObject({afterSequence: '2'})
    expect(process.exitCode).toBe(1)
  })

  test('stops a wait at --timeout even when the server holds the request', async () => {
    api.responses.push({data: operation('running', 2)}, HANG)
    silence()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      OperationWait.run([
        OPERATION,
        '--owner',
        'organization',
        '--timeout',
        '1',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(8)
    expect(api.calls).toHaveLength(2)
    await vi.waitFor(() => expect(api.closedEarly).toBe(1))
  }, 20_000)

  test('stops watch at --timeout when the first read hangs', async () => {
    api.responses.push(HANG)
    silence()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      OperationWatch.run([
        OPERATION,
        '--owner',
        'organization',
        '--timeout',
        '1',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(8)
    expect(api.calls).toHaveLength(1)
    await vi.waitFor(() => expect(api.closedEarly).toBe(1))
  }, 20_000)

  test('cancels with confirmation and a caller idempotency key', async () => {
    api.responses.push({
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
    expect(api.calls[0]).toMatchObject({
      method: 'POST',
      path: `/platform/operations/${OPERATION}/cancel`,
    })
    expect(api.calls[0]?.headers['idempotency-key']).toBe('cancel_1')
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
    expect(api.calls).toHaveLength(0)
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

function environment<T>(run: () => Promise<T>): Promise<T> {
  return withEnvironment(
    {
      POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      POLYMORFA_BASE_URL: api.url,
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
