import {runCommand} from '@oclif/test'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'

import {writeFully} from '../../src/commands/calls/export.js'
import {exportCallRecords} from '../../src/services/call-analytics.js'

import {
  startHttpSequenceServer,
  withEnvironment,
  type ResponseFixture,
  type TestHttpServer,
} from '../helpers/http-server.js'
import {temporaryDirectory} from '../support/fs.js'

const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const PROJECT_TOKEN = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const PROJECT = '11111111-1111-4111-8111-111111111111'

const HEADER =
  'callId,projectId,sessionId,direction,upstream,outcome,state,hasVideo,peerRef,startedAt,connectedAt,endedAt,durationSeconds,endReason'

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    calls: 12,
    answered: 9,
    missed: 2,
    declined: 1,
    failed: 0,
    inProgress: 0,
    answerRate: 0.75,
    totalDurationSeconds: 3725,
    averageDurationSeconds: 413.9,
    ...overrides,
  }
}

function stats(overrides: Record<string, unknown> = {}) {
  return {
    since: '2026-09-11T00:00:00.000Z',
    until: '2026-09-18T00:00:00.000Z',
    timezone: 'UTC',
    groupBy: 'day',
    totals: metrics(),
    groups: [
      {key: '2026-09-17', start: '2026-09-17T00:00:00.000Z', ...metrics()},
      {
        key: '2026-09-18',
        start: '2026-09-18T00:00:00.000Z',
        ...metrics({
          calls: 0,
          answered: 0,
          missed: 0,
          declined: 0,
          answerRate: null,
          totalDurationSeconds: 0,
          averageDurationSeconds: null,
        }),
      },
    ],
    groupsTruncated: false,
    heatmap: Array.from({length: 168}, (_, index) => ({
      dayOfWeek: Math.floor(index / 24) + 1,
      hour: index % 24,
      calls: index === 14 ? 7 : 0,
      answered: index === 14 ? 5 : 0,
    })),
    ...overrides,
  }
}

function csvRow(id: string): string {
  return `${id},${PROJECT},support,inbound,linked_device,answered,ended,false,peer_1,2026-09-17T10:00:00.000Z,2026-09-17T10:00:05.000Z,2026-09-17T10:01:05.000Z,60,user_hangup`
}

function csvPage(ids: readonly string[], next?: string): ResponseFixture {
  return {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      ...(next === undefined ? {} : {'Polymorfa-Next-Cursor': next}),
    },
    rawBody: `${[HEADER, ...ids.map(csvRow)].join('\r\n')}\r\n`,
  }
}

function ndjsonPage(ids: readonly string[], next?: string): ResponseFixture {
  return {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      ...(next === undefined ? {} : {'Polymorfa-Next-Cursor': next}),
    },
    rawBody: ids.map((callId) => `${JSON.stringify({callId})}\n`).join(''),
  }
}

describe('calls stats', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('prints totals and groups for one project with every filter', async () => {
    server = await startHttpSequenceServer([{body: {data: stats()}}])

    const result = await apiKey(() =>
      runCommand([
        'calls',
        'stats',
        '--project',
        PROJECT,
        '--session',
        'support',
        '--direction',
        'inbound',
        '--upstream',
        'linked_device',
        '--outcome',
        'answered',
        '--since',
        '2026-09-11T00:00:00Z',
        '--until',
        '2026-09-18T00:00:00Z',
        '--group-by',
        'day',
        '--timezone',
        'Europe/Lisbon',
      ]),
    )

    expect(result.error).toBeUndefined()
    const url = new URL(server.requests[0]?.url ?? '', 'http://localhost')
    expect(url.pathname).toBe('/platform/calls/stats')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      direction: 'inbound',
      groupBy: 'day',
      outcome: 'answered',
      projectId: PROJECT,
      sessionId: 'support',
      since: '2026-09-11T00:00:00Z',
      timezone: 'Europe/Lisbon',
      until: '2026-09-18T00:00:00Z',
      upstream: 'linked_device',
    })
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`)
    expect(result.stdout).toContain('Calls\t12\n')
    expect(result.stdout).toContain('Answer rate\t75.0%\n')
    expect(result.stdout).toContain('Talk time\t1h 2m 5s\n')
    expect(result.stdout).toContain('Average call\t6m 54s\n')
    expect(result.stdout).toContain(
      'Day\tCalls\tAnswered\tMissed\tDeclined\tFailed\tIn progress\tAnswer rate\tTalk time\tAverage\n',
    )
    expect(result.stdout).toContain(
      '2026-09-17\t12\t9\t2\t1\t0\t0\t75.0%\t1h 2m 5s\t6m 54s\n',
    )
    expect(result.stdout).toContain('2026-09-18\t0\t0\t0\t0\t0\t0\t-\t0s\t-\n')
    expect(result.stdout).not.toContain('Calls by hour')
  })

  test('reads the whole organization without --project and prints the heatmap', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: stats({
            groupBy: 'session',
            groups: [{key: 'support', start: null, ...metrics()}],
            groupsTruncated: true,
          }),
        },
      },
    ])

    const result = await apiKey(() =>
      runCommand('calls stats --group-by session --heatmap'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/calls/stats?groupBy=session',
    )
    expect(result.stdout).toContain('Session\tCalls')
    expect(result.stdout).toContain('Only the 500 numbers with the most calls')
    expect(result.stdout).toContain('Calls by hour\t00\t01')
    expect(result.stdout).toMatch(/\nMon\t(0\t){14}7\t0/)
  })

  test('prints the standard JSON envelope', async () => {
    server = await startHttpSequenceServer([
      {body: {data: stats()}, headers: {'x-request-id': 'req_1'}},
    ])

    const result = await apiKey(() => runCommand('calls stats --json'))

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      data: stats(),
      context: {owner: 'organization', principalType: 'organization_key'},
      request: {apiVersion: null, id: 'req_1', status: 200},
    })
  })

  test('uses a project token only for its explicit project', async () => {
    server = await startHttpSequenceServer([{body: {data: stats()}}])

    const missing = await projectToken(() => runCommand('calls stats'))
    const scoped = await projectToken(() =>
      runCommand(['calls', 'stats', '--project', PROJECT]),
    )

    expect(exitCode(missing.error)).toBe(2)
    expect(missing.stderr).toContain('--project')
    expect(scoped.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.url).toBe(
      `/platform/calls/stats?projectId=${PROJECT}&groupBy=day`,
    )
    expect(server.requests[0]?.headers.authorization).toBe(
      `Bearer ${PROJECT_TOKEN}`,
    )
  })

  test('accepts single-name IANA time zones', async () => {
    server = await startHttpSequenceServer([
      {body: {data: stats()}},
      {body: {data: stats()}},
    ])

    const results = await apiKey(async () => [
      await runCommand('calls stats --timezone CET'),
      await runCommand('calls stats --timezone GMT'),
    ])

    for (const result of results) expect(result.error).toBeUndefined()
    expect(
      server.requests.map((request) =>
        new URL(request.url, 'http://localhost').searchParams.get('timezone'),
      ),
    ).toEqual(['CET', 'GMT'])
  })

  test('rejects invalid filters before sending a request', async () => {
    server = await startHttpSequenceServer([{body: {data: stats()}}])

    const results = await apiKey(async () => [
      await runCommand('calls stats --since yesterday'),
      await runCommand(
        'calls stats --since 2026-09-18T00:00:00Z --until 2026-09-11T00:00:00Z',
      ),
      await runCommand('calls stats --timezone +01:00'),
      await runCommand(
        'calls stats --group-by hour --since 2026-08-01T00:00:00Z --until 2026-09-18T00:00:00Z',
      ),
      await runCommand('calls stats --group-by week'),
      await runCommand('calls stats --outcome busy'),
    ])

    for (const result of results) expect(exitCode(result.error)).toBe(2)
    expect(results[2]?.stderr).toContain('IANA time zone')
    expect(results[3]?.stderr).toContain('at most 31 days')
    expect(server.requests).toHaveLength(0)
  })

  test('exits non-zero with the API error', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          error: {
            code: 'insufficient_scope',
            message: 'This credential lacks the sessions:read scope.',
          },
        },
        headers: {'x-request-id': 'req_denied'},
        status: 403,
      },
    ])

    const result = await apiKey(() => runCommand('calls stats'))

    expect(exitCode(result.error)).toBe(3)
    expect(result.stderr).toContain('sessions:read')
    expect(result.stdout).toBe('')
  })

  test('rejects a malformed statistics response without printing partial output', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {totals: metrics()}}},
    ])

    const result = await apiKey(() => runCommand('calls stats --json'))

    expect(exitCode(result.error)).not.toBe(0)
    expect(result.stderr).toContain('not recognized')
    expect(result.stdout).toBe('')
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
    return credentials({POLYMORFA_API_KEY: API_KEY}, run)
  }

  async function projectToken<T>(run: () => Promise<T>): Promise<T> {
    return credentials({POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN}, run)
  }

  async function credentials<T>(
    values: Record<string, string>,
    run: () => Promise<T>,
  ): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
        ...values,
      },
      run,
    )
  }
})

describe('calls export', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('walks every page and writes the CSV header once', async () => {
    server = await startHttpSequenceServer([
      csvPage(['call_1', 'call_2'], 'cursor_2'),
      csvPage(['call_3', 'call_4'], 'cursor_3'),
      csvPage(['call_5']),
    ])

    const result = await apiKey(() =>
      runCommand([
        'calls',
        'export',
        '--project',
        PROJECT,
        '--outcome',
        'answered',
        '--since',
        '2026-09-01T00:00:00Z',
        '--limit',
        '2',
      ]),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(
      `${[HEADER, ...['call_1', 'call_2', 'call_3', 'call_4', 'call_5'].map(csvRow)].join('\r\n')}\r\n`,
    )
    expect(result.stdout.split(HEADER)).toHaveLength(2)
    const queries = server.requests.map(({url}) =>
      Object.fromEntries(new URL(url, 'http://localhost').searchParams),
    )
    const filters = {
      format: 'csv',
      limit: '2',
      outcome: 'answered',
      projectId: PROJECT,
      since: '2026-09-01T00:00:00Z',
    }
    expect(queries).toEqual([
      filters,
      {...filters, cursor: 'cursor_2'},
      {...filters, cursor: 'cursor_3'},
    ])
    expect(server.requests[0]?.headers.accept).toBe('text/csv')
    expect(result.stderr).toContain('Page 1: 2 records (2 total).')
    expect(result.stderr).toContain(
      'Exported 5 records in 3 pages to standard output.',
    )
  })

  test('writes NDJSON to a new file and refuses to overwrite it', async () => {
    server = await startHttpSequenceServer([
      ndjsonPage(['call_1'], 'cursor_2'),
      ndjsonPage(['call_2']),
    ])
    directory = await temporaryDirectory()
    const output = join(directory, 'calls.ndjson')

    const written = await apiKey(() =>
      runCommand(['calls', 'export', '--format', 'ndjson', '--output', output]),
    )
    const refused = await apiKey(() =>
      runCommand(['calls', 'export', '--format', 'ndjson', '-o', output]),
    )

    expect(written.error).toBeUndefined()
    expect(written.stdout).toBe('')
    expect(await readFile(output, 'utf8')).toBe(
      '{"callId":"call_1"}\n{"callId":"call_2"}\n',
    )
    expect(server.requests[0]?.url).toBe(
      '/platform/calls/export?format=ndjson&limit=1000',
    )
    expect(exitCode(refused.error)).toBe(4)
    expect(refused.stderr).toContain('--force')
    expect(server.requests).toHaveLength(2)
  })

  test('creates or truncates the output file for an empty NDJSON export', async () => {
    server = await startHttpSequenceServer([ndjsonPage([]), ndjsonPage([])])
    directory = await temporaryDirectory()
    const created = join(directory, 'new.ndjson')
    const replaced = join(directory, 'old.ndjson')
    await writeFile(replaced, '{"callId":"stale"}\n')

    const first = await apiKey(() =>
      runCommand(['calls', 'export', '--format', 'ndjson', '-o', created]),
    )
    const second = await apiKey(() =>
      runCommand([
        'calls',
        'export',
        '--format',
        'ndjson',
        '-o',
        replaced,
        '--force',
      ]),
    )

    expect(first.error).toBeUndefined()
    expect(second.error).toBeUndefined()
    expect(await readFile(created, 'utf8')).toBe('')
    expect(await readFile(replaced, 'utf8')).toBe('')
    expect(second.stderr).toContain('Exported 0 records in 1 page')
  })

  test('refuses an existing output file before resolving a project slug', async () => {
    server = await startHttpSequenceServer([ndjsonPage(['call_1'])])
    directory = await temporaryDirectory()
    const output = join(directory, 'calls.csv')
    await writeFile(output, 'keep')

    const result = await apiKey(() =>
      runCommand(['calls', 'export', '--project', 'support', '-o', output]),
    )

    expect(exitCode(result.error)).toBe(4)
    expect(result.stderr).toContain('--force')
    expect(server.requests).toHaveLength(0)
    expect(await readFile(output, 'utf8')).toBe('keep')
  })

  test('overwrites with --force and writes the header for a resumed export', async () => {
    server = await startHttpSequenceServer([csvPage(['call_9'])])
    directory = await temporaryDirectory()
    const output = join(directory, 'calls.csv')
    await writeFile(output, 'old contents')

    const result = await apiKey(() =>
      runCommand([
        'calls',
        'export',
        '--cursor',
        'cursor_9',
        '--output',
        output,
        '--force',
      ]),
    )

    expect(result.error).toBeUndefined()
    expect(await readFile(output, 'utf8')).toBe(
      `${HEADER}\r\n${csvRow('call_9')}\r\n`,
    )
    expect(server.requests[0]?.url).toBe(
      '/platform/calls/export?format=csv&limit=1000&cursor=cursor_9',
    )
  })

  test('stops after --max-pages and reports the cursor on standard error', async () => {
    server = await startHttpSequenceServer([
      csvPage(['call_1'], 'cursor_2'),
      csvPage(['call_2'], 'cursor_3'),
    ])

    const human = await apiKey(() => runCommand('calls export --max-pages 1'))
    const json = await apiKey(() =>
      runCommand('calls export --max-pages 1 --json'),
    )

    expect(human.error).toBeUndefined()
    expect(human.stdout).toBe(`${HEADER}\r\n${csvRow('call_1')}\r\n`)
    expect(human.stderr).toContain('continue with --cursor cursor_2')
    expect(json.error).toBeUndefined()
    const lines = json.stderr
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines).toEqual([
      {
        type: 'page',
        nextCursor: 'cursor_3',
        page: 1,
        records: 1,
        totalRecords: 1,
      },
      {
        type: 'done',
        destination: 'standard output',
        complete: false,
        nextCursor: 'cursor_3',
        pages: 1,
        records: 1,
      },
    ])
    expect(server.requests).toHaveLength(2)
  })

  test('exits non-zero when a later page fails and reports the resume cursor', async () => {
    server = await startHttpSequenceServer([
      csvPage(['call_1'], 'cursor_2'),
      {
        body: {error: {code: 'invalid_request', message: 'invalid cursor'}},
        status: 400,
      },
    ])

    const result = await apiKey(() => runCommand('calls export'))

    expect(exitCode(result.error)).toBe(2)
    expect(result.stdout).toBe(`${HEADER}\r\n${csvRow('call_1')}\r\n`)
    expect(result.stderr).toContain(
      'Stopped after 1 page and 1 record. Resume with --cursor cursor_2',
    )
    expect(result.stderr).toContain('invalid cursor')
  })

  test('rejects an HTML export response without writing it to standard output', async () => {
    server = await startHttpSequenceServer([
      {
        headers: {'content-type': 'text/html'},
        rawBody: '<html>proxy error</html>',
      },
    ])

    const result = await apiKey(() => runCommand('calls export'))

    expect(exitCode(result.error)).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain('<html>')
  })

  test('fails when the API repeats a cursor or changes the CSV columns', async () => {
    server = await startHttpSequenceServer([
      csvPage(['call_1'], 'cursor_2'),
      csvPage(['call_2'], 'cursor_2'),
    ])
    const repeated = await apiKey(() =>
      runCommand('calls export --cursor cursor_2'),
    )
    await server.close()

    server = await startHttpSequenceServer([
      csvPage(['call_1'], 'cursor_2'),
      {
        headers: {'content-type': 'text/csv; charset=utf-8'},
        rawBody: 'callId,other\r\ncall_2,x\r\n',
      },
    ])
    const changed = await apiKey(() => runCommand('calls export'))

    expect(exitCode(repeated.error)).toBe(5)
    expect(repeated.stderr).toContain('same continuation cursor')
    expect(exitCode(changed.error)).toBe(5)
    expect(changed.stderr).toContain('changed its CSV columns')
    expect(changed.stdout).toBe(`${HEADER}\r\n${csvRow('call_1')}\r\n`)
  })

  test('rejects a cursor cycle before writing the repeated page', async () => {
    server = await startHttpSequenceServer([
      csvPage(['call_1'], 'cursor_a'),
      csvPage(['call_2'], 'cursor_b'),
      csvPage(['call_3'], 'cursor_a'),
    ])

    const result = await apiKey(() => runCommand('calls export'))

    expect(exitCode(result.error)).toBe(5)
    expect(result.stderr).toContain('earlier continuation cursor')
    expect(result.stdout).toBe(
      `${HEADER}\r\n${csvRow('call_1')}\r\n${csvRow('call_2')}\r\n`,
    )
    expect(server.requests).toHaveLength(3)
  })

  test('validates flags before sending a request', async () => {
    server = await startHttpSequenceServer([csvPage([])])

    const results = await apiKey(async () => [
      await runCommand('calls export --format xml'),
      await runCommand('calls export --limit 0'),
      await runCommand('calls export --limit 1001'),
      await runCommand('calls export --max-pages 0'),
      await runCommand('calls export --until not-a-time'),
      await runCommand('calls export --direction sideways'),
    ])

    for (const result of results) expect(exitCode(result.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test('writes only the header when no calls match', async () => {
    server = await startHttpSequenceServer([csvPage([])])

    const result = await apiKey(() => runCommand('calls export --quiet'))

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(`${HEADER}\r\n`)
    expect(result.stderr).toBe('')
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      run,
    )
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}

describe('writeFully', () => {
  test('keeps writing after a short write', async () => {
    const written: Buffer[] = []
    const file = {
      write: (buffer: Buffer, offset: number, length: number) => {
        // Persist at most three bytes per call, as a short write may.
        const size = Math.min(3, length)
        written.push(Buffer.from(buffer.subarray(offset, offset + size)))
        return Promise.resolve({bytesWritten: size, buffer})
      },
    }

    await writeFully(file as never, 'callId,peerRef\r\nçall_1,f00d\r\n')

    expect(Buffer.concat(written).toString('utf8')).toBe(
      'callId,peerRef\r\nçall_1,f00d\r\n',
    )
  })

  test('fails instead of looping when nothing is written', async () => {
    const file = {write: () => Promise.resolve({bytesWritten: 0})}
    await expect(writeFully(file as never, 'x')).rejects.toThrow(
      'Could not write',
    )
  })
})

describe('exportCallRecords', () => {
  test('does not advertise a resume cursor after a partial write', async () => {
    let partialOutput = ''
    let stopped:
      {nextCursor: string | null; pages: number; records: number} | undefined

    await expect(
      exportCallRecords({
        api: {
          exportPage: () =>
            Promise.resolve({
              body: '{"callId":"call_1"}\n',
              metadata: {},
              nextCursor: 'cursor_2',
            }),
        } as never,
        format: 'ndjson',
        limit: 1,
        onStop: (summary) => {
          stopped = summary
        },
        query: {},
        write: (chunk) => {
          partialOutput = chunk.slice(0, 5)
          return Promise.reject(new Error('disk full'))
        },
      }),
    ).rejects.toThrow('disk full')

    expect(partialOutput).toBe('{"cal')
    expect(stopped).toEqual({
      complete: false,
      nextCursor: null,
      pages: 0,
      records: 0,
    })
  })
})
