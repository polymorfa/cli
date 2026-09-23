import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Audience and opt-out commands', () => {
  let directory: string | undefined
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('creates an audience from a spreadsheet and reports the import counts', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-audience-'))
    const csv = join(directory, 'contacts.csv')
    await writeFile(csv, 'phone,plan\n+15551234567,pro\n', 'utf8')
    server = await startHttpServer({body: {data: audience()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `audience create --name "August launch" --csv ${csv} --variable plan=plan`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/platform/audiences')
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      members: [{phone: '+15551234567', variables: {plan: 'pro'}}],
      name: 'August launch',
      source: 'csv',
    })
    expect(result.stdout).toContain('Members\t2')
    expect(result.stdout).toContain('Row 2\tmissing_phone')
  })

  test('imports a file already uploaded through the API', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-audience-'))
    const mapping = join(directory, 'mapping.json')
    await writeFile(
      mapping,
      JSON.stringify({phone: 'Phone', variables: {plan: 'Plan'}}),
      'utf8',
    )
    server = await startHttpServer({body: {data: audience()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `audience create --name "August launch" --file-id upload_1 --mapping ${mapping}`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      fileId: 'upload_1',
      mapping: {phone: 'Phone', variables: {plan: 'Plan'}},
      name: 'August launch',
      source: 'csv',
    })
  })

  test('refuses a file import without a mapping before sending it', async () => {
    server = await startHttpServer({body: {data: audience()}})

    const result = await apiKeyEnvironment(() =>
      runCommand('audience create --name August --file-id upload_1'),
    )

    expect(result.error).toBeDefined()
    expect(result.stderr).toContain(
      'must be provided when using --file-id: --mapping',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('refuses a mapping that does not name the phone column', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-audience-'))
    const mapping = join(directory, 'mapping.json')
    await writeFile(mapping, JSON.stringify({variables: {}}), 'utf8')
    server = await startHttpServer({body: {data: audience()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `audience create --name August --file-id upload_1 --mapping ${mapping}`,
      ),
    )

    expect(result.error).toBeDefined()
    expect(result.stderr).toContain('must name the phone column')
    expect(server.requests).toHaveLength(0)
  })

  test('pages audience members and offers the next cursor', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            createdAt: 1_723_000_000_000,
            id: 'member_1',
            phone: '+15551234567',
            variables: {plan: 'pro'},
          },
        ],
        page: {hasMore: true, nextCursor: 'cursor_2'},
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('audience members list list_1 --limit 10'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/audiences/list_1/members?limit=10',
    )
    expect(result.stdout).toContain('plan=pro')
    expect(result.stdout).toContain('--cursor cursor_2')
  })

  test('removes one member through the encoded member route', async () => {
    server = await startHttpServer({
      body: {
        data: {
          listId: 'list_1',
          phone: '+15551234567',
          recipientCount: 9,
          removed: true,
        },
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('audience members remove list_1 +1/555'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.method).toBe('DELETE')
    expect(server.requests[0]?.url).toBe(
      '/platform/audiences/list_1/members/%2B1%2F555',
    )
    expect(result.stdout).toContain('9 members remain')
  })

  test('reports a no-op when the member was not in the audience', async () => {
    server = await startHttpServer({
      body: {
        data: {
          listId: 'list_1',
          phone: '+15551234567',
          recipientCount: 9,
          removed: false,
        },
      },
    })
    const result = await apiKeyEnvironment(() =>
      runCommand('audience members remove list_1 +15551234567'),
    )
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('was not in audience list_1')
    expect(result.stdout).not.toContain('Removed')
  })

  test('reads the organization keyword settings', async () => {
    server = await startHttpServer({body: {data: settings()}})

    const result = await apiKeyEnvironment(() =>
      runCommand('optout settings view'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/platform/optouts/settings')
    expect(result.stdout).toContain('Opt-out keywords\tSTOP, BAJA')
  })

  test('replaces the whole keyword document', async () => {
    server = await startHttpServer({body: {data: settings()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'optout settings update --enabled --opt-out-keyword STOP --opt-out-keyword BAJA --opt-in-keyword START --idempotency-key settings_1',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.method).toBe('PUT')
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      enabled: true,
      optInKeywords: ['START'],
      optOutKeywords: ['STOP', 'BAJA'],
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('settings_1')
  })

  test('turns capture off without clearing the required keyword set', async () => {
    server = await startHttpServer({
      body: {data: {...settings(), enabled: false}},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('optout settings update --no-enabled --opt-out-keyword STOP'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      enabled: false,
      optInKeywords: [],
      optOutKeywords: ['STOP'],
    })
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})

function audience() {
  return {
    columns: ['phone', 'plan'],
    createdAt: 1_723_000_000_000,
    duplicateCount: 1,
    fileId: null,
    id: 'list_1',
    invalidCount: 1,
    invalidRows: [{reason: 'missing_phone', row: 1}],
    mapping: null,
    name: 'August launch',
    recipientCount: 2,
    sampleRow: null,
    source: 'csv',
    updatedAt: 1_723_000_000_000,
  }
}

function settings() {
  return {
    enabled: true,
    optInKeywords: ['START'],
    optOutKeywords: ['STOP', 'BAJA'],
    updatedAt: 1_723_000_000_000,
  }
}
