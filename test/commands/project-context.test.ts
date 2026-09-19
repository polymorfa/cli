import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const APP = '11111111-1111-4111-8111-111111111111'

describe('link and project commands', () => {
  let directory: string
  let original: string
  let server: TestHttpServer | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-project-'))
    original = process.cwd()
    process.chdir(directory)
  })

  afterEach(async () => {
    process.chdir(original)
    await server?.close()
    server = undefined
    await rm(directory, {force: true, recursive: true})
  })

  test('links the directory by slug and reports the linked project', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            _creationTime: 0,
            _id: APP,
            name: 'App',
            orgId: 'org_1',
            slug: 'app',
            stage: 'development',
          },
        ],
        success: true,
      },
    })

    const env = {
      POLYMORFA_API_KEY: API_KEY,
      POLYMORFA_BASE_URL: server.baseUrl,
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_CONFIG_DIR: join(directory, 'config'),
      POLYMORFA_PROJECT_TOKEN: undefined,
    }
    const link = await withEnvironment(env, () =>
      runCommand('link --project app --json'),
    )
    expect(link.error, link.stderr).toBeUndefined()
    expect(JSON.parse(link.stdout)).toMatchObject({project: APP, slug: 'app'})
    expect(
      JSON.parse(
        await readFile(join(directory, '.polymorfa', 'project.json'), 'utf8'),
      ),
    ).toEqual({project: APP, version: 1})

    const current = await withEnvironment(env, () =>
      runCommand('project current --json'),
    )
    expect(JSON.parse(current.stdout)).toMatchObject({
      project: APP,
      source: 'link',
    })
  })

  test('reports no project outside a link without credentials', async () => {
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CONFIG_DIR: join(directory, 'config'),
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () => runCommand('project current'),
    )
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('No project selected')
  })
})
