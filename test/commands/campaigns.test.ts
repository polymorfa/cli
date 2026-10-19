import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Messaging campaign commands', () => {
  let directory: string | undefined
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('lists the complete newest-first project campaign array', async () => {
    server = await startHttpServer({
      body: {data: [campaign()], success: true},
      headers: {'request-id': 'req_campaign_list'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('campaign list --project-slug project/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: [campaign()],
      metadata: {attempts: 1, requestId: 'req_campaign_list', status: 200},
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/projects/project%2Fmain/campaigns',
    )
  })

  test.each(['campaign_create', undefined])(
    'creates a campaign with an explicit or generated idempotency key (%s)',
    async (key) => {
      const input = await jsonInput('campaign.json', {
        name: 'September launch',
        recipientListId: 'recipients_1',
        senderConfig: {session: 'session_1'},
        templateId: 'template_1',
      })
      server = await startHttpServer({body: {data: campaign(), success: true}})

      const result = await apiKeyEnvironment(() =>
        runCommand(
          `campaign create --project-slug project_1 --input ${input} ${key === undefined ? '' : `--idempotency-key ${key}`} --json`,
        ),
      )

      expect(result.error).toBeUndefined()
      expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
        name: 'September launch',
        recipientListId: 'recipients_1',
        senderConfig: {session: 'session_1'},
        templateId: 'template_1',
      })
      expect(server.requests[0]).toMatchObject({
        method: 'POST',
        url: '/messaging/projects/project_1/campaigns',
      })
      if (key === undefined) {
        expect(server.requests[0]?.headers['idempotency-key']).toMatch(
          /^pmfa_cli_[0-9a-f-]{36}$/,
        )
      } else {
        expect(server.requests[0]?.headers['idempotency-key']).toBe(key)
      }
    },
  )

  test('views one campaign and its exact live analytics counters', async () => {
    server = await startHttpSequenceServer([
      {body: {data: campaign(), success: true}},
      {
        body: {
          data: {
            campaignId: 'campaign/1',
            deliveredCount: 8,
            failedCount: 1,
            readCount: 6,
            recipientCount: 10,
            respondedCount: 2,
            responseRate: 0.2,
            sentCount: 9,
            skippedCount: 0,
          },
          success: true,
        },
      },
    ])

    const view = await apiKeyEnvironment(() =>
      runCommand('campaign view campaign/1 --project-slug project/main --json'),
    )
    const analytics = await apiKeyEnvironment(() =>
      runCommand(
        'campaign analytics campaign/1 --project-slug project/main --json',
      ),
    )

    expect(view.error).toBeUndefined()
    expect(analytics.error).toBeUndefined()
    expect(server.requests.map((request) => request.url)).toEqual([
      '/messaging/projects/project%2Fmain/campaigns/campaign%2F1',
      '/messaging/projects/project%2Fmain/campaigns/campaign%2F1/analytics',
    ])
  })

  test.each(['launch_1', undefined])(
    'launches with an explicit or generated idempotency key (%s)',
    async (key) => {
      server = await startHttpServer({
        body: {
          data: {...campaign(), operationId: 'operation_1', status: 'draft'},
          success: true,
        },
      })

      const result = await apiKeyEnvironment(() =>
        runCommand(
          `campaign launch campaign_1 --project-slug project_1 --scheduled-at 2026-09-01T12:00:00Z ${key === undefined ? '' : `--idempotency-key ${key}`}`,
        ),
      )

      expect(result.error).toBeUndefined()
      expect(result.stdout).toContain(
        'Accepted campaign launch as operation operation_1.',
      )
      expect(result.stdout).toContain(
        'Check the campaign status with polymorfa campaign view.',
      )
      expect(result.stdout).not.toContain('Campaign launched successfully')
      expect(server.requests[0]).toMatchObject({
        body: JSON.stringify({scheduledAt: 1_788_264_000_000}),
        method: 'POST',
        url: '/messaging/projects/project_1/campaigns/campaign_1/launch',
      })
      if (key === undefined) {
        expect(server.requests[0]?.headers['idempotency-key']).toMatch(
          /^pmfa_cli_[0-9a-f-]{36}$/,
        )
      } else {
        expect(server.requests[0]?.headers['idempotency-key']).toBe(key)
      }
    },
  )

  test('rejects an invalid launch time before transport', async () => {
    server = await startHttpServer({body: {data: campaign(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'campaign launch campaign_1 --project-slug project_1 --scheduled-at someday --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Scheduled time must be epoch milliseconds or an ISO 8601 instant',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('pauses, resumes, and explicitly stops through distinct lifecycle routes', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {...campaign(), operationId: 'op_pause'}, success: true}},
      {body: {data: {...campaign(), operationId: 'op_resume'}, success: true}},
      {body: {data: {...campaign(), operationId: 'op_stop'}, success: true}},
    ])

    const pause = await apiKeyEnvironment(() =>
      runCommand(
        'campaign pause campaign_1 --project-slug project_1 --idempotency-key pause_1 --json',
      ),
    )
    const resume = await apiKeyEnvironment(() =>
      runCommand(
        'campaign resume campaign_1 --project-slug project_1 --idempotency-key resume_1 --json',
      ),
    )
    const stop = await apiKeyEnvironment(() =>
      runCommand(
        'campaign stop campaign_1 --project-slug project_1 --yes --idempotency-key stop_1 --json',
      ),
    )

    expect(pause.error).toBeUndefined()
    expect(resume.error).toBeUndefined()
    expect(stop.error).toBeUndefined()
    expect(server.requests.map((request) => request.url)).toEqual([
      '/messaging/projects/project_1/campaigns/campaign_1/pause',
      '/messaging/projects/project_1/campaigns/campaign_1/resume',
      '/messaging/projects/project_1/campaigns/campaign_1/stop',
    ])
    expect(
      server.requests.map((request) => request.headers['idempotency-key']),
    ).toEqual(['pause_1', 'resume_1', 'stop_1'])
  })

  test('refuses terminal campaign stop without confirmation before transport', async () => {
    server = await startHttpServer({body: {data: campaign(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('campaign stop campaign_1 --project-slug project_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag yes')
    expect(server.requests).toHaveLength(0)
  })

  test('reports an immediate campaign stop without inventing an operation', async () => {
    server = await startHttpServer({
      body: {
        data: {...campaign(), operationId: null, status: 'cancelled'},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('campaign stop campaign_1 --project-slug project_1 --yes'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      'Cancelled campaign campaign/1; it had no active delivery run.',
    )
    expect(result.stdout).toContain(
      'The campaign is cancelled. No remaining recipient is sent.',
    )
    expect(result.stdout).not.toContain('operation null')
  })

  test('requeues failed and optionally skipped-error recipients directly', async () => {
    server = await startHttpServer({body: {data: {requeued: 3}, success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'campaign requeue campaign_1 --project-slug project_1 --include-skipped-error --idempotency-key requeue_1',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Requeued 3 recipients.')
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({includeSkippedError: true}),
      method: 'POST',
      url: '/messaging/projects/project_1/campaigns/campaign_1/requeue',
    })
  })

  test('does not expose console-only operation polling', async () => {
    server = await startHttpServer({
      body: {
        data: {
          completedAt: null,
          createdAt: '2026-08-20T00:00:00Z',
          failureCode: null,
          id: 'operation/1',
          kind: 'campaign.launch',
          progressCode: null,
          projectId: 'project_1',
          resourceId: 'campaign_1',
          resourceType: 'campaign',
          status: 'running',
          updatedAt: '2026-08-20T00:00:01Z',
        },
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('operation view operation/1 --surface messaging --json'),
    )

    expect(result.error).toBeDefined()
    expect(server.requests).toEqual([])
  })

  test('rejects browser client tokens before campaign transport', async () => {
    server = await startHttpServer({body: {data: [], success: true}})

    const result = await clientTokenEnvironment(() =>
      runCommand('campaign list --project-slug project_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Campaign commands require a server API key',
    )
    expect(server.requests).toHaveLength(0)
  })

  async function jsonInput(name: string, value: unknown): Promise<string> {
    directory ??= await mkdtemp(join(tmpdir(), 'polymorfa-campaign-'))
    const path = join(directory, name)
    await writeFile(path, JSON.stringify(value))
    return path
  }

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }

  async function clientTokenEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      run,
    )
  }
})

function campaign() {
  return {
    completedAt: null,
    createdAt: 1_723_000_000_000,
    deliveredCount: 8,
    failedCount: 1,
    id: 'campaign/1',
    launchedAt: 1_723_000_100_000,
    name: 'September launch',
    readCount: 6,
    recipientCount: 10,
    recipientListId: 'recipients_1',
    scheduledAt: null,
    sentCount: 9,
    skippedCount: 0,
    status: 'running',
    templateId: 'template_1',
    updatedAt: 1_723_000_200_000,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
