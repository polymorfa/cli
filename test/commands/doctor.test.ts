import {runCommand} from '@oclif/test'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'

describe('doctor command exit status', () => {
  let server: TestHttpServer
  let directory: string

  beforeAll(async () => {
    server = await startHttpServer({body: {success: true, data: []}})
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-doctor-'))
  })

  afterAll(async () => {
    await server.close()
    await rm(directory, {force: true, recursive: true})
  })

  beforeEach(() => {
    process.exitCode = undefined
  })

  afterEach(() => {
    process.exitCode = undefined
  })

  async function doctor(env: Record<string, string | undefined>) {
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CONFIG_DIR: directory,
        ...env,
      },
      () => runCommand('doctor --json'),
    )
  }

  test('returns success for an authenticated server API key', async () => {
    const result = await doctor({POLYMORFA_API_KEY: API_KEY})
    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({ok: true})
    expect(process.exitCode).toBeUndefined()
    expect(server.requests.map((request) => request.url)).toContain(
      '/platform/projects',
    )
  })

  test('returns failure when credential validation is skipped', async () => {
    const result = await doctor({POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_example'})
    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({ok: false})
    expect(process.exitCode).toBe(1)
  })

  test('returns failure for ambiguous credentials without using either', async () => {
    const requestsBefore = server.requests.length
    const result = await doctor({
      POLYMORFA_API_KEY: API_KEY,
      POLYMORFA_PROJECT_TOKEN: 'private-project-token',
    })
    expect(result.error, result.stderr).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({ok: false})
    expect(process.exitCode).toBe(1)
    expect(
      server.requests.slice(requestsBefore).map((request) => request.url),
    ).toEqual(['/ping'])
    expect(result.stdout).not.toContain(API_KEY)
    expect(result.stdout).not.toContain('private-project-token')
  })
})
