import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const REFERRAL = {
  code: 'k3m9p2q8rt',
  link: 'https://polymorfa.com/r/k3m9p2q8rt',
  enabled: true,
  welcomeBonus: {percent: 25, capCredits: '5000'},
  tiers: [
    {minReferrals: 1, percent: 10},
    {minReferrals: 4, percent: 15},
    {minReferrals: 25, percent: 20},
  ],
  rewardCapCredits: '10000',
  holdDays: 30,
  groupShareEnabled: true,
}

describe('referral link', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('prints only the link', async () => {
    server = await startHttpServer({
      body: {data: REFERRAL},
      headers: {'request-id': 'req_referral'},
    })

    const result = await platformEnvironment(() => runCommand('referral link'))

    expect(result.error).toBeUndefined()
    expect(result.stdout.trim()).toBe('https://polymorfa.com/r/k3m9p2q8rt')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/referral',
    ])
    expect(server.requests[0]?.headers.authorization).toMatch(/^Bearer pmfa_/)
  })

  test('prints the full response with --json', async () => {
    server = await startHttpServer({
      body: {data: REFERRAL},
      headers: {'request-id': 'req_referral'},
    })

    const result = await platformEnvironment(() =>
      runCommand('referral link --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: REFERRAL,
      metadata: {requestId: 'req_referral', status: 200},
    })
  })

  test('reports a team without referral access as a failure', async () => {
    server = await startHttpServer({
      status: 403,
      body: {
        error: {
          type: 'permission_error',
          code: 'feature_unavailable',
          message: 'Referrals are not available to this team.',
          param: null,
          request_id: 'req_denied',
        },
        data: null,
      },
    })

    const result = await platformEnvironment(() => runCommand('referral link'))

    expect(exitCode(result.error)).toBe(3)
    expect(result.stdout).toBe('')
  })

  test('rejects a response without a referral link', async () => {
    server = await startHttpServer({body: {data: {code: 'k3m9p2q8rt'}}})

    const result = await platformEnvironment(() => runCommand('referral link'))

    expect(exitCode(result.error)).toBe(5)
    expect(result.stdout).toBe('')
  })

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

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
