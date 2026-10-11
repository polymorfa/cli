import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('campaign A/B test and weighted variation output (beta)', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('renders a promoted A/B test with the winner marked', async () => {
    const data = analytics({
      criterion: 'read',
      holdoutCount: 50,
      outcome: {state: 'promoted', winnerKey: 'b'},
      reserveCount: 700,
      variants: [variant('a', 'Short', 0.4), variant('b', 'Long', 0.5625)],
    })

    const output = await humanOutput('campaign analytics campaign_1', data)

    expect(output).toBe(
      [
        ...BASE_ANALYTICS_LINES,
        '',
        'A/B criterion\tRead rate',
        'A/B outcome\tWinner: Long [b], promoted to the reserve',
        'Holdout\t50',
        'Reserve\t700',
        '',
        'Variant\tRead rate\tSent\tAssigned\tDelivered\tRead\tReplied',
        'Short [a]\t40.0%\t80\t100\t75\t32\t6',
        'Long [b] (winner)\t56.3%\t80\t100\t75\t32\t6',
      ].join('\n'),
    )
  })

  test('renders an inconclusive A/B test with its reason', async () => {
    const data = analytics({
      criterion: 'reply',
      holdoutCount: 0,
      outcome: {reason: 'insufficient_evidence', state: 'inconclusive'},
      reserveCount: 800,
      variants: [variant('a', 'Short', 0.05), variant('b', 'Long', 0.06)],
    })

    const output = await humanOutput('campaign analytics campaign_1', data)

    expect(output).toContain('A/B criterion\tReply rate')
    expect(output).toContain(
      'A/B outcome\tInconclusive (insufficient_evidence); the reserve was not sent',
    )
    expect(output).toContain(
      'Variant\tReply rate\tSent\tAssigned\tDelivered\tRead\tReplied',
    )
    expect(output).not.toContain('(winner)')
  })

  test('renders a running A/B test with no winner yet', async () => {
    const data = analytics({
      criterion: 'delivery',
      holdoutCount: 10,
      outcome: null,
      reserveCount: 500,
      variants: [variant('a', 'Short', 0.9), variant('b', 'Long', 0.85)],
    })

    const output = await humanOutput('campaign analytics campaign_1', data)

    expect(output).toContain('A/B outcome\tNo winner yet')
    expect(output).toContain('Short [a]\t90.0%')
    expect(output).not.toContain('(winner)')
  })

  test.each([
    ['null', {experiment: null}],
    ['absent', {}],
  ])(
    'keeps analytics unchanged when experiment is %s',
    async (_name, extra) => {
      const output = await humanOutput('campaign analytics campaign_1', {
        ...baseAnalytics(),
        ...extra,
      })

      expect(output).toBe(BASE_ANALYTICS_LINES.join('\n'))
    },
  )

  test('reports an unreadable experiment instead of printing part of it', async () => {
    const output = await humanOutput('campaign analytics campaign_1', {
      ...baseAnalytics(),
      experiment: {criterion: 'read', variants: 'unexpected'},
    })

    expect(output).toContain(
      'A/B test\tUnreadable in this CLI version; use --json for the full response.',
    )
  })

  test('escapes control characters in variant labels', async () => {
    const output = await humanOutput(
      'campaign analytics campaign_1',
      analytics({
        criterion: 'read',
        holdoutCount: 0,
        outcome: null,
        reserveCount: 0,
        variants: [variant('a', 'Bad\u001b[31m', 0.1)],
      }),
    )

    expect(output).toContain('Bad\\u001b[31m [a]')
    expect(output).not.toContain('\u001b')
  })

  test('passes experiment results through unchanged in JSON output', async () => {
    const data = analytics({
      criterion: 'read',
      holdoutCount: 0,
      outcome: {state: 'promoted', winnerKey: 'a'},
      reserveCount: 10,
      variants: [variant('a', 'Short', 0.4), variant('b', 'Long', 0.2)],
    })
    server = await startHttpServer({body: {data, success: true}})

    const result = await withApiKey(() =>
      runCommand('campaign analytics campaign_1 --project-slug launch --json'),
    )

    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(data)
  })

  test('shows the variant count and outcome on an A/B campaign', async () => {
    const output = await humanOutput('campaign view campaign_1', {
      ...campaign(),
      experimentOutcome: {state: 'promoted', winnerKey: 'a'},
      variants: [campaignVariant('a', 'Short'), campaignVariant('b', 'Long')],
      variantStrategy: {
        autoPromote: true,
        holdoutPercent: 5,
        testWindowMinutes: 120,
        winnerCriterion: 'read',
      },
    })

    expect(output).toBe(
      [
        ...BASE_CAMPAIGN_LINES,
        'A/B test\t2 variants',
        'A/B outcome\tWinner: Short [a], promoted to the reserve',
      ].join('\n'),
    )
  })

  test('shows no winner yet on an undecided A/B campaign', async () => {
    const output = await humanOutput('campaign view campaign_1', {
      ...campaign(),
      experimentOutcome: null,
      variants: [
        campaignVariant('a', 'Short'),
        campaignVariant('b', 'Long'),
        campaignVariant('c', 'Emoji'),
      ],
    })

    expect(output).toContain('A/B test\t3 variants')
    expect(output).toContain('A/B outcome\tNo winner yet')
  })

  test('shows the number of weighted alternatives', async () => {
    const output = await humanOutput('campaign view campaign_1', {
      ...campaign(),
      messageVariations: [
        {blueprint: {source: 'Hello!', version: 2}, key: 'hello', weight: 60},
        {blueprint: {source: 'Hi!', version: 2}, key: 'hi', weight: 40},
      ],
      variants: null,
    })

    expect(output).toBe(
      [
        ...BASE_CAMPAIGN_LINES,
        'Message variations\t2 weighted alternatives',
      ].join('\n'),
    )
  })

  test('keeps a broadcast campaign view unchanged', async () => {
    const output = await humanOutput('campaign view campaign_1', {
      ...campaign(),
      experimentOutcome: null,
      messageVariations: null,
      variantStrategy: null,
      variants: null,
    })

    expect(output).toBe(BASE_CAMPAIGN_LINES.join('\n'))
  })

  test('mentions both beta input fields in create help', async () => {
    const result = await runCommand('campaign create --help')

    expect(result.stdout).toContain('variantStrategy')
    expect(result.stdout).toContain('messageVariations')
    expect(result.stdout).toContain('403 feature_unavailable')
  })

  async function humanOutput(command: string, data: unknown): Promise<string> {
    server = await startHttpServer({body: {data, success: true}})
    const result = await withApiKey(() =>
      runCommand(`${command} --project-slug launch`),
    )
    expect(result.error).toBeUndefined()
    return result.stdout.trimEnd()
  }

  async function withApiKey<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})

const BASE_ANALYTICS_LINES = [
  'Campaign\tcampaign_1',
  'Recipients\t1000',
  'Sent\t160',
  'Delivered\t150',
  'Read\t64',
  'Failed\t0',
  'Skipped\t50',
  'Responded\t12',
  'Response rate\t0.075',
]

const BASE_CAMPAIGN_LINES = [
  'ID\tcampaign_1',
  'Name\tOctober offer',
  'Status\trunning',
  'Recipients\t1000',
  'Sent\t160',
  'Delivered\t150',
  'Read\t64',
  'Failed\t0',
  'Skipped\t50',
  'Scheduled\t2024-08-07T03:07:30.000Z',
]

function baseAnalytics() {
  return {
    campaignId: 'campaign_1',
    deliveredCount: 150,
    failedCount: 0,
    readCount: 64,
    recipientCount: 1000,
    respondedCount: 12,
    responseRate: 0.075,
    sentCount: 160,
    skippedCount: 50,
  }
}

function analytics(experiment: unknown) {
  return {...baseAnalytics(), experiment}
}

function variant(key: string, label: string, outcomeRate: number) {
  return {
    assigned: 100,
    delivered: 75,
    key,
    label,
    outcomeRate,
    read: 32,
    replied: 6,
    sent: 80,
    weight: 50,
  }
}

function campaignVariant(key: string, label: string) {
  return {
    blueprint: {source: `Message ${key}`, version: 2},
    key,
    label,
    weight: 50,
  }
}

function campaign() {
  return {
    completedAt: null,
    createdAt: 1_723_000_000_000,
    deliveredCount: 150,
    failedCount: 0,
    id: 'campaign_1',
    launchedAt: 1_723_000_100_000,
    name: 'October offer',
    readCount: 64,
    recipientCount: 1000,
    recipientListId: 'recipients_1',
    scheduledAt: 1_723_000_050_000,
    sentCount: 160,
    skippedCount: 50,
    status: 'running',
    templateId: null,
    updatedAt: 1_723_000_200_000,
  }
}
