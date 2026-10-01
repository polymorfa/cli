import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const PROJECT = '0199a000-0000-7000-8000-000000000002'
const CAMPAIGN = '0199a000-0000-7000-8000-000000000003'
const RECIPIENT = '0199a000-0000-7000-8000-000000000004'

describe('Campaign conversion commands (beta)', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('records a conversion without echoing the event ID', async () => {
    server = await startHttpServer({body: {data: conversion()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign conversions record ${CAMPAIGN} --project-id ${PROJECT} --recipient ${RECIPIENT} --event-id ORDER-SECRET-1 --event-type purchase --occurred-at 2026-10-01T10:00:00Z --amount-minor 1999 --currency USD`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.method).toBe('POST')
    expect(server.requests[0]?.url).toBe(
      `/platform/campaigns/${CAMPAIGN}/conversions`,
    )
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      eventId: 'ORDER-SECRET-1',
      eventType: 'purchase',
      occurredAt: '2026-10-01T10:00:00Z',
      projectId: PROJECT,
      recipientId: RECIPIENT,
      value: {amountMinor: 1999, currency: 'USD'},
    })
    expect(result.stdout).toContain('Outcome\tattributed')
    expect(result.stdout).toContain('1999 USD (minor units, as reported)')
    expect(result.stdout).not.toContain('ORDER-SECRET-1')
  })

  test('sends no value without both amount and currency', async () => {
    server = await startHttpServer({body: {data: conversion()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign conversions record ${CAMPAIGN} --project-id ${PROJECT} --recipient ${RECIPIENT} --event-id e1 --event-type sign_up --occurred-at 2026-10-01T10:00:00Z --amount-minor 5`,
      ),
    )

    expect(result.error).toBeDefined()
    expect(result.stderr).toContain('--currency')
    expect(server.requests).toHaveLength(0)
  })

  test('reports a replayed conversion as already recorded', async () => {
    server = await startHttpServer({
      body: {data: {...conversion(), replayed: true}},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign conversions record ${CAMPAIGN} --project-id ${PROJECT} --recipient ${RECIPIENT} --event-id e1 --event-type purchase --occurred-at 2026-10-01T10:00:00Z`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Already recorded conversion')
  })

  test('shows the report per currency', async () => {
    server = await startHttpServer({body: {data: report()}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign conversions report ${CAMPAIGN} --project-id ${PROJECT}`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      `/platform/campaigns/${CAMPAIGN}/conversions?projectId=${PROJECT}`,
    )
    expect(result.stdout).toContain('Attributed\t5')
    expect(result.stdout).toContain('Converted recipients\t2 of 4 sent')
    expect(result.stdout).toContain('Value BRL\t5000 attributed')
    expect(result.stdout).toContain(
      'Value USD\t1250 attributed, 700 not attributed',
    )
  })

  test('surfaces a beta refusal and exits with an error', async () => {
    server = await startHttpServer({
      body: {
        error: 'This beta is not available to this team',
        code: 'feature_unavailable',
      },
      status: 403,
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign conversions report ${CAMPAIGN} --project-id ${PROJECT}`,
      ),
    )

    expect(result.error).toBeDefined()
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

function conversion() {
  return {
    attribution: {
      outcome: 'attributed',
      touchAt: '2026-09-30T10:00:00.000Z',
      windowDays: 7,
    },
    campaignId: CAMPAIGN,
    eventType: 'purchase',
    evidence: 'customer_reported',
    id: '0199a000-0000-7000-8000-000000000009',
    occurredAt: '2026-10-01T10:00:00.000Z',
    recipientId: RECIPIENT,
    recordedAt: '2026-10-01T10:00:01.000Z',
    replayed: false,
    value: {amountMinor: 1999, currency: 'USD'},
  }
}

function report() {
  return {
    campaignId: CAMPAIGN,
    conversionRate: 0.5,
    conversions: {
      attributed: 5,
      notSent: 1,
      optedOut: 0,
      outsideWindow: 0,
      total: 6,
    },
    convertedRecipients: 2,
    model: {
      correlation: 'explicit_recipient',
      touch: 'recipient_sent',
      windowDays: 7,
    },
    sentCount: 4,
    values: [
      {
        attributedAmountMinor: '5000',
        attributedConversions: 1,
        currency: 'BRL',
        evidence: 'customer_reported',
        unattributedAmountMinor: '0',
        unattributedConversions: 0,
      },
      {
        attributedAmountMinor: '1250',
        attributedConversions: 2,
        currency: 'USD',
        evidence: 'customer_reported',
        unattributedAmountMinor: '700',
        unattributedConversions: 1,
      },
    ],
  }
}
