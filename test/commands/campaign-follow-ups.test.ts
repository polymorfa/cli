import {runCommand} from '@oclif/test'

import {
  duration,
  followUpCell,
  renderFollowUpAnalytics,
} from '../../src/services/campaign-follow-ups.js'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const report = {
  cancelled: 1,
  delivered: 3,
  expired: 0,
  failed: 0,
  nextDueAt: 1_760_000_000_000,
  read: 2,
  replied: 1,
  scheduled: 2,
  sending: 0,
  sent: 3,
  total: 8,
  unknown: 1,
  waiting: 2,
}

describe('campaign follow-up output (beta)', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('shows follow-up timing on view and outcomes on analytics, apart from first-message counts', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            ...campaign(),
            followUp: {
              delaySeconds: 86_400,
              expirySeconds: 604_800,
              message: {text: 'Still interested?', type: 'text'},
            },
          },
          success: true,
        },
      },
      {body: {data: {...analytics(), followUps: report}, success: true}},
    ])
    const view = await apiKey(() =>
      runCommand('campaign view campaign_1 --project-slug project_1'),
    )
    const result = await apiKey(() =>
      runCommand('campaign analytics campaign_1 --project-slug project_1'),
    )
    expect(view.error).toBeUndefined()
    expect(view.stdout).toContain('Follow-up\ttext message')
    expect(view.stdout).toContain(
      'Follow-up wait\t1 day after first delivery or read',
    )
    expect(view.stdout).toContain(
      'Follow-up expiry\t7 days after the first send',
    )
    // The message body never reaches human output.
    expect(view.stdout).not.toContain('Still interested?')
    expect(result.stdout).toContain('Sent\t9')
    expect(result.stdout).toContain('Recipients with a follow-up\t8')
    expect(result.stdout).toContain('Replies after follow-up\t1')
    expect(result.stdout).toContain('Follow-up outcome unknown\t1')
    expect(result.stdout).toContain(
      `Next follow-up due\t${new Date(1_760_000_000_000).toISOString()}`,
    )
  })

  test('keeps existing output for campaigns without a follow-up and reports unreadable shapes', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            ...analytics(),
            followUps: {
              ...report,
              cancelled: 0,
              delivered: 0,
              read: 0,
              replied: 0,
              scheduled: 0,
              sent: 0,
              total: 0,
              unknown: 0,
              waiting: 0,
              nextDueAt: null,
            },
          },
          success: true,
        },
      },
      {
        body: {
          data: {
            ...campaign(),
            followUp: {delaySeconds: 'soon', message: {type: 'text'}},
          },
          success: true,
        },
      },
    ])
    const result = await apiKey(() =>
      runCommand('campaign analytics campaign_1 --project-slug project_1'),
    )
    const view = await apiKey(() =>
      runCommand('campaign view campaign_1 --project-slug project_1'),
    )
    expect(result.stdout).not.toContain('follow-up')
    expect(view.stdout).toContain(
      'Follow-up\tUnreadable in this CLI version; use --json for the full response.',
    )
  })

  test('adds a follow-up column to recipients only when a recipient has one', async () => {
    const recipient = (id: string, followUp: unknown) => ({
      attempts: 1,
      deliveredAt: null,
      externalMessageId: null,
      failedAt: null,
      followUp,
      id,
      lastError: null,
      phone: '+15550100101',
      queuedAt: 1,
      readAt: null,
      respondedAt: null,
      sentAt: null,
      status: 'read',
      variables: {},
      variantKey: null,
    })
    server = await startHttpServer({
      body: {
        data: [
          recipient('r1', {
            anchorKind: 'read',
            reason: null,
            status: 'scheduled',
          }),
          recipient('r2', {
            anchorKind: 'read',
            reason: 'reply',
            status: 'cancelled',
          }),
          recipient('r3', null),
        ],
        page: {hasMore: false, nextCursor: null},
        success: true,
      },
    })
    const result = await apiKey(() =>
      runCommand(
        'campaign recipients list campaign_1 --project-slug project_1',
      ),
    )
    expect(result.error).toBeUndefined()
    const lines = result.stdout.trim().split('\n')
    expect(lines[0]?.split('\t').at(-1)).toBe('scheduled')
    expect(lines[1]?.split('\t').at(-1)).toBe('cancelled (reply)')
    expect(lines[2]).not.toMatch(/scheduled|cancelled|unreadable/)
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
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
})

function campaign() {
  return {
    completedAt: null,
    createdAt: 1_723_000_000_000,
    deliveredCount: 8,
    failedCount: 1,
    id: 'campaign_1',
    launchedAt: 1_723_000_100_000,
    name: 'September launch',
    readCount: 6,
    recipientCount: 10,
    recipientListId: 'recipients_1',
    scheduledAt: null,
    sentCount: 9,
    skippedCount: 0,
    status: 'running',
    templateId: null,
    updatedAt: 1_723_000_200_000,
  }
}

function analytics() {
  return {
    campaignId: 'campaign_1',
    deliveredCount: 8,
    failedCount: 1,
    readCount: 6,
    recipientCount: 10,
    respondedCount: 2,
    responseRate: 0.2,
    sentCount: 9,
    skippedCount: 0,
  }
}

describe('follow-up narrowing', () => {
  test('renders exact durations without rounding', () => {
    expect(duration(90)).toBe('1 minute 30 seconds')
    expect(duration(86_400)).toBe('1 day')
    expect(duration(93_600)).toBe('1 day 2 hours')
  })

  test('reports invalid next-due times and unknown statuses as unreadable', () => {
    const counts = {
      cancelled: 0,
      delivered: 0,
      expired: 0,
      failed: 0,
      read: 0,
      replied: 0,
      scheduled: 1,
      sending: 0,
      sent: 0,
      total: 1,
      unknown: 0,
      waiting: 0,
    }
    for (const nextDueAt of [1e20, 'tomorrow', 1.5])
      expect(
        renderFollowUpAnalytics({followUps: {...counts, nextDueAt}}),
      ).toEqual([
        '',
        'Follow-ups\tUnreadable in this CLI version; use --json for the full response.',
      ])
    expect(followUpCell({followUp: {status: 'constructor'}})).toBe('unreadable')
    expect(followUpCell({followUp: {status: 'future_state'}})).toBe(
      'unreadable',
    )
    expect(followUpCell({followUp: {reason: 42, status: 'sent'}})).toBe(
      'unreadable',
    )
    expect(followUpCell({followUp: {reason: null, status: 'sent'}})).toBe(
      'sent',
    )
  })
})
