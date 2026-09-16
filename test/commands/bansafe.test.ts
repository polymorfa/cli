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

describe('BanSafe commands', () => {
  let directory: string | undefined
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test.each([
    {
      body: {data: [], page: {hasMore: false, nextCursor: null}},
      command: 'bansafe health list --project project_1 --limit 20 --json',
      path: '/platform/bansafe/health?projectId=project_1&limit=20',
    },
    {
      body: {data: [], page: {hasMore: false, nextCursor: null}},
      command: 'bansafe collection list --project project_1 --json',
      path: '/platform/bansafe/collection?projectId=project_1',
    },
    {
      body: {data: [], page: {hasMore: false, nextCursor: null}},
      command:
        'bansafe health-action list --project project_1 --session session_1 --status failed --json',
      path: '/platform/bansafe/health-actions?projectId=project_1&session=session_1&status=failed',
    },
    {
      body: {data: []},
      command: 'bansafe signal list --json',
      path: '/platform/bansafe/signals',
    },
  ])(
    'uses the typed Platform route for $command',
    async ({body, command, path}) => {
      server = await startHttpServer({body})

      const result = await platformEnvironment(() => runCommand(command))

      expect(result.error).toBeUndefined()
      expect(server.requests[0]).toMatchObject({method: 'GET', url: path})
    },
  )

  test('views current telemetry and requests bounded history filters', async () => {
    server = await startHttpServer({
      body: {data: [], page: {hasMore: false, nextCursor: null}},
    })

    const result = await platformEnvironment(() =>
      runCommand(
        'bansafe telemetry history session/1 --since 2026-09-01T00:00:00Z --until 2026-09-08T00:00:00Z --cursor next_1 --limit 50 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/bansafe/telemetry/session%2F1/history?cursor=next_1&limit=50&since=2026-09-01T00%3A00%3A00Z&until=2026-09-08T00%3A00%3A00Z',
    )
  })

  test('gets Health history without inventing cursor pagination', async () => {
    server = await startHttpServer({
      body: {data: {points: [], session: 'session_1', sessionId: 'id_1'}},
    })

    const result = await platformEnvironment(() =>
      runCommand(
        'bansafe health history session_1 --since 2026-09-01T00:00:00Z --limit 720 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/bansafe/health/session_1/history?limit=720&since=2026-09-01T00%3A00%3A00Z',
    )
  })

  test('replaces a complete Health policy with idempotency', async () => {
    server = await startHttpServer({body: {data: policy()}})
    const input = await jsonInput('policy.json', {
      emailNotification: true,
      enabled: true,
      sessionAction: 'slow_down',
      slowDownMps: 0.5,
      threshold: 30,
      version: 4,
      webhookNotification: false,
    })

    const result = await platformEnvironment(() =>
      runCommand(
        `bansafe health-policy update --project project_1 --input ${input} --idempotency-key policy_4 --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/platform/projects/project_1/health-policy',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('policy_4')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toMatchObject({
      sessionAction: 'slow_down',
      slowDownMps: 0.5,
      version: 4,
    })
  })

  test('prints fractional claim credit quantities as credits', async () => {
    server = await startHttpServer({
      body: {
        data: {
          amountCents: 12.345678,
          capCents: 50.5,
          createdAt: '2026-09-08T00:00:00Z',
          decidedAt: null,
          evidence: {
            attributionRuleVersion: 1,
            criticalFindingDays: 0,
            deviceEvidence: true,
            measuredHours: 24,
            otherDevices: 0,
            restrictedInWindow: true,
            sharedConnection: false,
            windowDays: 7,
          },
          id: 'claim_1',
          incidentId: 'incident_1',
          measuredCents: 0.000001,
          paidAt: null,
          phoneNumber: '+1',
          projectId: 'p1',
          reason: 'Attributed to Polymorfa.',
          session: 's1',
          sessionId: 'id1',
          status: 'under_review',
          summary: 'Restricted inside the claim window.',
          verdict: 'ours',
          windowEnd: '2026-09-08T00:00:00Z',
          windowStart: '2026-09-01T00:00:00Z',
        },
      },
    })

    const result = await platformEnvironment(() =>
      runCommand('bansafe claim view claim_1'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe('/platform/bansafe/claims/claim_1')
    expect(result.stdout).toContain('Amount credits\t12.345678')
    expect(result.stdout).toContain('Measured credits\t0.000001')
    expect(result.stdout).toContain('Cap credits\t50.5')
    expect(result.stdout).not.toContain('cents')
  })

  test('requires idempotency for Health policy updates', async () => {
    server = await startHttpServer({body: {data: policy()}})
    const input = await jsonInput('policy.json', policy())

    const result = await platformEnvironment(() =>
      runCommand(
        `bansafe health-policy update --project project_1 --input ${input} --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag idempotency-key')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects an incomplete or contradictory Health policy before transport', async () => {
    server = await startHttpServer({body: {data: policy()}})
    const input = await jsonInput('invalid-policy.json', {
      emailNotification: false,
      enabled: true,
      sessionAction: 'slow_down',
      slowDownMps: null,
      threshold: 30,
      version: 4,
      webhookNotification: false,
    })

    const result = await platformEnvironment(() =>
      runCommand(
        `bansafe health-policy update --project project_1 --input ${input} --idempotency-key policy_invalid --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('slow_down requires a positive slowDownMps')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects collection and action limits above the public maximum', async () => {
    server = await startHttpServer({
      body: {data: [], page: {hasMore: false, nextCursor: null}},
    })

    const collection = await platformEnvironment(() =>
      runCommand(
        'bansafe collection list --project project_1 --limit 101 --json',
      ),
    )
    const actions = await platformEnvironment(() =>
      runCommand(
        'bansafe health-action list --project project_1 --limit 101 --json',
      ),
    )

    expect(exitCode(collection.error)).toBe(2)
    expect(exitCode(actions.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test.each([
    [
      'bansafe finding list --project p1 --status open --json',
      '/platform/bansafe/findings?projectId=p1&status=open',
    ],
    [
      'bansafe enforcement list --project p1 --rung throttle --json',
      '/platform/bansafe/enforcement?projectId=p1&rung=throttle',
    ],
    [
      'bansafe incident list --project p1 --session s1 --json',
      '/platform/bansafe/incidents?projectId=p1&session=s1',
    ],
    [
      'bansafe claim list --project p1 --status paid --json',
      '/platform/bansafe/claims?projectId=p1&status=paid',
    ],
  ])(
    'lists existing machine-readable BanSafe resources: %s',
    async (command, path) => {
      server = await startHttpServer({
        body: {data: [], page: {hasMore: false, nextCursor: null}},
      })
      const result = await platformEnvironment(() => runCommand(command))
      expect(result.error).toBeUndefined()
      expect(server.requests[0]?.url).toBe(path)
    },
  )

  test('reports and retracts customer incidents with explicit retry identity', async () => {
    server = await startHttpServer({
      body: {
        data: {
          created: true,
          incidentId: 'incident_1',
          occurredAt: '2026-09-08T00:00:00Z',
          session: 's1',
          sessionId: 'id1',
        },
      },
    })
    const report = await platformEnvironment(() =>
      runCommand(
        'bansafe incident report --session s1 --occurred-at 2026-09-08T00:00:00Z --note observed --idempotency-key report_1 --json',
      ),
    )
    expect(report.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/platform/bansafe/incidents',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('report_1')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      note: 'observed',
      occurredAt: '2026-09-08T00:00:00Z',
      session: 's1',
    })

    await server.close()
    server = await startHttpServer({body: {data: incident()}})
    const retract = await platformEnvironment(() =>
      runCommand(
        'bansafe incident retract incident/1 --idempotency-key retract_1 --json',
      ),
    )
    expect(retract.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/platform/bansafe/incidents/incident%2F1/retract',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('retract_1')
  })

  test('gets and updates project and session Safe Mode through separate typed resources', async () => {
    server = await startHttpServer({body: {data: projectSafeMode()}})
    const input = await jsonInput('safe-mode.json', {
      onlineEnd: 18,
      onlineStart: 9,
      pacing: 'jittered',
      presence: 'dark',
    })
    const project = await platformEnvironment(() =>
      runCommand(
        `bansafe safe-mode update --project p1 --input ${input} --idempotency-key safe_1 --json`,
      ),
    )
    expect(project.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/platform/projects/p1/safe-mode',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toMatchObject({
      onlineEnd: 18,
      onlineStart: 9,
    })

    await server.close()
    server = await startHttpServer({body: {data: sessionSafeMode()}})
    const sessionInput = await jsonInput('session-safe-mode.json', {
      pacing: 'jittered',
      presence: 'dark',
    })
    const session = await platformEnvironment(() =>
      runCommand(
        `bansafe safe-mode update session/1 --input ${sessionInput} --idempotency-key safe_2 --json`,
      ),
    )
    expect(session.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/platform/sessions/session%2F1/safe-mode',
    })
  })

  test('updates warmup with a validated patch', async () => {
    server = await startHttpServer({body: {data: warmupPlan()}})
    const input = await jsonInput('warmup.json', {
      dailyStart: 10,
      enabled: true,
      warmupDays: 14,
    })
    const result = await platformEnvironment(() =>
      runCommand(
        `bansafe warmup update --project p1 --input ${input} --idempotency-key warmup_1 --json`,
      ),
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/platform/projects/p1/warmup-plan',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('warmup_1')
  })

  test('gets and updates insurance evidence settings', async () => {
    server = await startHttpServer({
      body: {
        data: {banInsuranceIncluded: true, enabled: true, projectId: 'p1'},
      },
    })
    const view = await platformEnvironment(() =>
      runCommand('bansafe insurance-evidence view --project p1 --json'),
    )
    expect(view.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/platform/projects/p1/insurance-evidence',
    )

    await server.close()
    server = await startHttpServer({
      body: {
        data: {banInsuranceIncluded: true, enabled: false, projectId: 'p1'},
      },
    })
    const input = await jsonInput('insurance.json', {enabled: false})
    const update = await platformEnvironment(() =>
      runCommand(
        `bansafe insurance-evidence update --project p1 --input ${input} --idempotency-key insurance_1 --json`,
      ),
    )
    expect(update.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/platform/projects/p1/insurance-evidence',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('insurance_1')
  })

  test('invalid mutation arguments stop before any live request', async () => {
    server = await startHttpServer({body: {data: {}}})
    const missingRetryIdentity = await platformEnvironment(() =>
      runCommand('bansafe incident report --session s1 --json'),
    )
    const missingSafeModeTarget = await platformEnvironment(() =>
      runCommand('bansafe safe-mode view --json'),
    )
    const invalidWarmup = await jsonInput('invalid-warmup.json', {
      warmupDays: -1,
    })
    const invalidPatch = await platformEnvironment(() =>
      runCommand(
        `bansafe warmup update --project p1 --input ${invalidWarmup} --idempotency-key invalid_1 --json`,
      ),
    )
    expect(exitCode(missingRetryIdentity.error)).toBe(2)
    expect(exitCode(missingSafeModeTarget.error)).toBe(2)
    expect(exitCode(invalidPatch.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  async function jsonInput(name: string, value: unknown): Promise<string> {
    directory ??= await mkdtemp(join(tmpdir(), 'polymorfa-bansafe-'))
    const path = join(directory, name)
    await writeFile(path, JSON.stringify(value))
    return path
  }

  async function platformEnvironment<T>(run: () => Promise<T>): Promise<T> {
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

function policy() {
  return {
    emailNotification: true,
    enabled: true,
    integrations: {emailConfigured: true, webhookConfigured: false},
    projectId: 'project_1',
    sessionAction: 'slow_down',
    slowDownMps: 0.5,
    threshold: 30,
    version: 4,
    webhookNotification: false,
  }
}

function incident() {
  return {
    ambiguous: false,
    claimId: null,
    closedAt: null,
    closedBy: null,
    createdAt: '2026-09-08T00:00:00Z',
    endsAt: null,
    id: 'incident_1',
    kind: 'customer_report',
    note: null,
    phoneNumber: '+1',
    projectId: 'p1',
    reportedBy: 'key_1',
    resolution: 'open',
    session: 's1',
    sessionId: 'id1',
    source: 'customer',
    startedAt: '2026-09-08T00:00:00Z',
  }
}

function settings() {
  return {
    onlineEnd: 17,
    onlineStart: 9,
    pacing: 'jittered',
    presence: 'dark',
    reads: 'replied_chats',
    typing: 'before_text',
  }
}

function projectSafeMode() {
  return {
    ceiling: settings(),
    entitled: true,
    entitlementReason: null,
    projectId: 'p1',
  }
}

function sessionSafeMode() {
  return {
    applied: null,
    effective: settings(),
    entitled: true,
    entitlementReason: null,
    mismatch: false,
    override: {
      pacing: 'inherit',
      presence: 'inherit',
      reads: 'inherit',
      typing: 'inherit',
    },
    project: settings(),
    projectId: 'p1',
    session: 's1',
  }
}

function warmupPlan() {
  return {
    ceiling: 100,
    curve: [],
    entitled: true,
    entitlementReason: null,
    plan: {dailyStart: 10, enabled: true, warmupDays: 14},
    projectId: 'p1',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
