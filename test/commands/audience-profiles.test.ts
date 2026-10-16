import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const phone = '+14155550123'
const profile = {
  id: 'profile-1',
  phone,
  revision: 2,
  tags: ['vip'],
  attributes: {name: 'Ada'},
  provenance: null,
  createdAt: 1,
  updatedAt: 2,
}
const job = {
  id: 'job-1',
  state: 'queued',
  totalValid: 1,
  invalidCount: 0,
  invalidSamples: [],
  conflictSamples: [],
  processedValid: 0,
  createdCount: 0,
  updatedCount: 0,
  conflictCount: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null,
}
async function testDirectory(prefix: string) {
  const parent = join(
    homedir(),
    '.polymorfa-agent-work',
    'audience-profiles',
    'cli-tests',
  )
  await mkdir(parent, {recursive: true})
  return mkdtemp(join(parent, prefix))
}
describe('campaign profiles commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory) await rm(directory, {recursive: true, force: true})
    directory = undefined
  })
  function run(command: string, env: Record<string, string | undefined> = {}) {
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_BASE_URL: server!.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        ...env,
      },
      () => runCommand(command),
    )
  }
  test('combines list filters and cursor, escaping terminal control characters', async () => {
    server = await startHttpServer({
      body: {
        data: [{...profile, tags: ['vip\u001b[2J']}],
        page: {nextCursor: 'next', hasMore: true},
      },
    })
    const result = await run(
      'campaign profiles list --tag vip --phone-prefix +44 --limit 2 --cursor prev',
    )
    expect(result.error).toBeUndefined()
    const url = new URL(server.requests[0]!.url, 'https://example.com')
    expect(url.pathname).toBe('/platform/audience-profiles')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tag: 'vip',
      phonePrefix: '+44',
      limit: '2',
      cursor: 'prev',
    })
    expect(server.requests[0]!.url).toContain('%2B44')
    expect(result.stdout).toContain('\\u001b[2J')
    expect(result.stdout).toContain('--cursor next')
  })
  test('preserves list envelope and pagination in JSON output', async () => {
    const envelope = {data: [profile], page: {nextCursor: null, hasMore: false}}
    server = await startHttpServer({body: envelope})
    const result = await run('campaign profiles list --json')
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout).data).toEqual(envelope)
  })
  test('retrieves an encoded phone', async () => {
    server = await startHttpServer({body: {data: profile}})
    const result = await run(`campaign profiles get ${phone}`)
    expect(result.error).toBeUndefined()
    expect(server.requests[0]!.url).toBe(
      '/platform/audience-profiles/%2B14155550123',
    )
    expect(result.stdout).toContain('Revision\t2')
  })
  test('upserts with replacement revision, tags, attributes and consent unchanged', async () => {
    directory = await testDirectory('cli-profile-')
    const input = join(directory, 'profile.json')
    const body = {
      expectedRevision: 2,
      tags: [],
      attributes: {active: false},
      consent: {
        purpose: 'campaigns',
        source: 'form',
        reference: 'signup-1',
        allowed: true,
        assertedAt: 1,
      },
    }
    await writeFile(input, JSON.stringify(body))
    server = await startHttpServer({body: {data: profile}})
    const result = await run(
      `campaign profiles upsert ${phone} --input ${input}`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]!.method).toBe('PUT')
    expect(JSON.parse(server.requests[0]!.body)).toEqual(body)
  })
  test('deletes with required revision', async () => {
    server = await startHttpServer({
      body: {data: {deleted: true, phone, revision: 3}},
    })
    const result = await run(
      `campaign profiles delete ${phone} --expected-revision 2`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]!.method).toBe('DELETE')
    expect(server.requests[0]!.url).toContain('expectedRevision=2')
    expect(result.stdout).toContain('retained revision 3')
  })
  test.each([
    `campaign profiles delete ${phone}`,
    `campaign profiles delete ${phone} --expected-revision 0`,
    'campaign profiles get 4155550123',
    'campaign profiles list --limit 101',
  ])('refuses invalid inputs: %s', async (command) => {
    server = await startHttpServer({body: {data: profile}})
    expect((await run(command)).error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
  test('lists consent without profile-list filters', async () => {
    server = await startHttpServer({
      body: {data: [], page: {nextCursor: null, hasMore: false}},
    })
    const result = await run(
      `campaign profiles consent ${phone} --limit 2 --cursor next`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]!.url).toBe(
      '/platform/audience-profiles/%2B14155550123/consent?cursor=next&limit=2',
    )
  })
  test('imports UTF-8 CSV with explicit mapping and stable replay identity', async () => {
    directory = await testDirectory('cli-import-')
    const csv = join(directory, 'contacts.csv'),
      mappingFile = join(directory, 'mapping.json')
    const text = 'Phone,Tags,Attributes\n+14155550123,vip,é\n',
      mapping = {phone: 'Phone', tags: 'Tags', attributes: 'Attributes'}
    await writeFile(csv, text)
    await writeFile(mappingFile, JSON.stringify(mapping))
    server = await startHttpServer({body: {data: job}})
    const result = await run(
      `campaign profiles import --csv ${csv} --mapping ${mappingFile} --replay-key import-1`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]!.url).toBe('/platform/audience-profile-imports')
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      replayKey: 'import-1',
      csvBase64: Buffer.from(text).toString('base64'),
      mapping,
    })
    expect(result.stdout).toContain('State\tqueued')
  })
  test.each([
    ['get', 'GET'],
    ['cancel', 'DELETE'],
  ])('supports import %s', async (command, method) => {
    server = await startHttpServer({body: {data: job}})
    const result = await run(`campaign profiles imports ${command} job-1`)
    expect(result.error).toBeUndefined()
    expect(server.requests[0]!.method).toBe(method)
    expect(server.requests[0]!.url).toBe(
      '/platform/audience-profile-imports/job-1',
    )
  })
  test.each([
    [403, 'feature_unavailable'],
    [409, 'conflict'],
  ])('preserves %s API failures', async (status, code) => {
    server = await startHttpServer({
      status: status as number,
      body: {error: {code, message: 'Denied'}},
    })
    expect((await run(`campaign profiles get ${phone}`)).error).toBeDefined()
  })
  test('rejects client tokens before accessing team profiles', async () => {
    server = await startHttpServer({body: {data: profile}})
    const result = await run('campaign profiles list', {
      POLYMORFA_API_KEY: undefined,
      POLYMORFA_CLIENT_TOKEN: 'client-token',
    })
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
})
