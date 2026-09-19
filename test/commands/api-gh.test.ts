import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('api gh-style options', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  const pages = [
    {
      body: {
        data: [{id: 'c1'}, {id: 'c2'}],
        page: {hasMore: true, nextCursor: 'n1'},
      },
    },
    {body: {data: [{id: 'c3'}], page: {hasMore: false, nextCursor: null}}},
  ]

  test('sends typed -F fields as JSON and -f as strings', async () => {
    server = await startHttpServer({body: {data: {ok: true}}})

    const result = await run(
      'api /v1/things --surface platform -X POST -f label=10 -F count=10 -F live=true -F tags[]=a -F tags[]=b -F meta[owner]=me --json',
    )

    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      count: 10,
      label: '10',
      live: true,
      meta: {owner: 'me'},
      tags: ['a', 'b'],
    })
  })

  test('turns GET fields into query parameters', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await run(
      'api /platform/customers --surface platform -F limit=5 -f q=ada --json',
    )

    expect(result.error, result.stderr).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/platform/customers?q=ada&limit=5')
  })

  test('follows cursors with --paginate and prints one JSON document', async () => {
    server = await startHttpSequenceServer(pages)

    const result = await run(
      'api /platform/customers --surface platform --paginate -F limit=2 --json',
    )

    expect(result.error, result.stderr).toBeUndefined()
    expect(server.requests.map((request) => request.url)).toEqual([
      '/platform/customers?limit=2',
      '/platform/customers?limit=2&cursor=n1',
    ])
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: [pages[0]?.body, pages[1]?.body],
      metadata: {pages: 2, status: 200},
    })
  })

  test('applies --jq to each page when paginating', async () => {
    server = await startHttpSequenceServer(pages)

    const result = await run(
      'api /platform/customers --surface platform --paginate --jq .data[].id',
    )

    expect(result.error, result.stderr).toBeUndefined()
    expect(result.stdout).toBe('c1\nc2\nc3\n')
  })

  test('applies --jq once to all pages with --slurp', async () => {
    server = await startHttpSequenceServer(pages)

    const result = await run(
      'api /platform/customers --surface platform --paginate --slurp --jq "map(.data | length) | add"',
    )

    expect(result.error, result.stderr).toBeUndefined()
    expect(result.stdout).toBe('3\n')
  })

  test('renders --template against the response', async () => {
    server = await startHttpServer(pages[1] as {body: unknown})

    const result = await run(
      `api /platform/customers --surface platform --template "{{range .data}}id={{.id}}{{end}}"`,
    )

    expect(result.error, result.stderr).toBeUndefined()
    expect(result.stdout).toBe('id=c3\n')
  })

  test('reports jq errors as validation failures', async () => {
    server = await startHttpServer({body: {data: []}})

    const result = await run(
      'api /platform/customers --surface platform --jq ".data | bogus("',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Invalid --jq filter')
  })

  test('rejects --slurp without --paginate and --paginate for writes', async () => {
    server = await startHttpServer({body: {data: []}})

    const slurp = await run(
      'api /platform/customers --surface platform --slurp',
    )
    const write = await run(
      'api /platform/customers --surface platform -X POST --paginate --json',
    )

    expect(exitCode(slurp.error)).toBe(2)
    expect(exitCode(write.error)).toBe(2)
    expect(write.stderr).toContain('only with GET')
    expect(server.requests).toHaveLength(0)
  })

  test('stops at --max-pages instead of looping', async () => {
    server = await startHttpServer({
      body: {data: [], page: {hasMore: true, nextCursor: 'again'}},
    })

    const result = await run(
      'api /platform/customers --surface platform --paginate --max-pages 1 --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Stopped after 1 pages')
    expect(server.requests).toHaveLength(1)
  })

  async function run(command: string) {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand(command),
    )
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
