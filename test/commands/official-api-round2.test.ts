import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
import {API_KEY_FIXTURE} from '../helpers/opaque-credential.js'

describe('Official API round-2 commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory) await rm(directory, {recursive: true, force: true})
    directory = undefined
  })
  const run = async (command: string) => {
    if (!server) throw Error('Server missing')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY_FIXTURE,
        POLYMORFA_PROJECT_TOKEN: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand(command),
    )
  }
  test.each([
    ['cloud catalog list --session n/eu', 'GET', '/messaging/n%2Feu/catalogs'],
    [
      'cloud catalog get --session n/eu --catalog 123',
      'GET',
      '/messaging/n%2Feu/catalogs/123',
    ],
    [
      'cloud catalog sync --session n/eu --catalog 123',
      'POST',
      '/messaging/n%2Feu/catalogs/123/sync',
    ],
    [
      'cloud catalog products --session n/eu --catalog 123 --limit 2 --cursor next_-',
      'GET',
      '/messaging/n%2Feu/catalogs/123/products?limit=2&cursor=next_-',
    ],
    [
      'cloud marketing status --session n/eu',
      'GET',
      '/messaging/n%2Feu/marketing-messages/status',
    ],
    [
      'contact block 123 --session n/eu',
      'POST',
      '/messaging/n%2Feu/contacts/123/block',
    ],
    [
      'contact unblock 123 --session n/eu',
      'POST',
      '/messaging/n%2Feu/contacts/123/unblock',
    ],
  ])('uses the native route for %s', async (command, method, url) => {
    server = await startHttpServer({
      body: {success: true, data: {catalogs: []}},
    })
    const result = await run(command + ' --json')
    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({method, url})
    expect(JSON.parse(result.stdout)).toBeTypeOf('object')
  })
  test.each([
    'cloud catalog list --session n',
    'cloud catalog sync --session n --catalog 123',
    'cloud marketing status --session n',
    'webhook update w --owner organization --batching on',
  ])(
    'retains feature_unavailable and authorization exit for %s',
    async (command) => {
      server = await startHttpServer({
        status: 403,
        body: {
          error: {code: 'feature_unavailable', message: 'Beta unavailable'},
        },
      })
      const result = await run(command + ' --json')
      expect(result.error).toBeDefined()
      expect(
        JSON.parse(
          result.stderr
            .split('\n')
            .find((line) => line.startsWith('{"schemaVersion"'))!,
        ),
      ).toMatchObject({
        error: {code: 'feature_unavailable'},
      })
      expect((result.error as {oclif: {exit: number}}).oclif.exit).toBe(3)
      expect(server.requests).toHaveLength(1)
    },
  )
  test('uploads Official group pictures through multipart and keeps Hybrid on the native route', async () => {
    const root = join(
      homedir(),
      '.polymorfa-agent-work',
      'oa-partner-20261021',
      'sdk-cli',
      'test-fixtures',
    )
    await mkdir(root, {recursive: true})
    directory = await mkdtemp(join(root, 'picture-'))
    const file = join(directory, 'picture.jpg')
    await writeFile(file, 'jpeg-fixture')
    server = await startHttpServer({
      body: {success: true, data: {accepted: true}},
    })
    let result = await run(
      `cloud group picture 123 --session n --file ${file} --json`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/messaging/n/official-groups/123/picture',
    })
    expect(server.requests[0]!.headers['content-type']).toMatch(
      /^multipart\/form-data; boundary=/,
    )
    expect(server.requests[0]!.body).toContain('name="file"')
    result = await run(
      'group picture 123 --session hybrid --url https://example.invalid/picture.jpg --json',
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      method: 'PUT',
      url: '/messaging/hybrid/groups/123/picture',
    })
    expect(JSON.parse(server.requests[1]!.body)).toEqual({
      url: 'https://example.invalid/picture.jpg',
    })
  })
  test('refuses incompatible target flags and bad catalog bounds without dispatch', async () => {
    server = await startHttpServer({body: {}})
    for (const command of [
      'cloud catalog list --session n --waba 123',
      'cloud catalog products --session n --catalog 123 --limit 101',
      'cloud catalog sync --session n --catalog ../x',
      'cloud marketing status --session n --graph-version v26.0',
    ]) {
      expect((await run(command + ' --json')).error).toBeDefined()
    }
    expect(server.requests).toHaveLength(0)
  })
  test('shows beta and routing restrictions in help', async () => {
    server = await startHttpServer({body: {}})
    for (const command of [
      'cloud marketing status',
      'cloud catalog sync',
      'cloud group picture',
      'webhook update',
    ]) {
      const result = await run(command + ' --help')
      expect(result.error).toBeUndefined()
      expect(result.stdout).toContain('beta')
    }
    expect(server.requests).toHaveLength(0)
  })
})
