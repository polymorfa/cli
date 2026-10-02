import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Official group commands (beta)', () => {
  let server: TestHttpServer | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  async function run(command: string, kind: 'api' | 'client' = 'api') {
    if (!server) throw Error('Server is not started')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          kind === 'api' ? `pmfa_${'A'.repeat(72)}` : undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
        POLYMORFA_CLIENT_TOKEN:
          kind === 'client' ? `pmfa_ct_${'A'.repeat(94)}` : undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => runCommand(command),
    )
  }

  test('maps every command to its documented route and body', async () => {
    server = await startHttpServer({body: {success: true, data: {}}})
    const base = '/messaging/number%2Feu/official-groups'
    const cases: Array<[string, string, string, unknown?]> = [
      [
        'cloud group list --session number/eu --limit 10 --after QUZ',
        'GET',
        `${base}?limit=10&after=QUZ`,
      ],
      [
        'cloud group create --session number/eu --subject Orders --join-approval',
        'POST',
        base,
        {subject: 'Orders', joinApprovalRequired: true},
      ],
      [
        'cloud group get 739182640518203 --session number/eu',
        'GET',
        `${base}/739182640518203`,
      ],
      [
        'cloud group update 739182640518203 --session number/eu --description Hi',
        'PATCH',
        `${base}/739182640518203`,
        {description: 'Hi'},
      ],
      [
        'cloud group delete 739182640518203 --session number/eu --yes',
        'DELETE',
        `${base}/739182640518203`,
      ],
      [
        'cloud group invite-link 739182640518203 --session number/eu',
        'GET',
        `${base}/739182640518203/invite-link`,
      ],
      [
        'cloud group invite-link 739182640518203 --session number/eu --reset',
        'POST',
        `${base}/739182640518203/invite-link/reset`,
      ],
      [
        'cloud group remove-participants 739182640518203 --session number/eu --participant +15550001111 --participant 123',
        'POST',
        `${base}/739182640518203/participants/remove`,
        {participants: ['+15550001111', '123']},
      ],
      [
        'cloud group join-requests list 739182640518203 --session number/eu',
        'GET',
        `${base}/739182640518203/join-requests`,
      ],
      [
        'cloud group join-requests approve 739182640518203 --session number/eu --request MTY0',
        'POST',
        `${base}/739182640518203/join-requests/approve`,
        {joinRequestIds: ['MTY0']},
      ],
      [
        'cloud group join-requests reject 739182640518203 --session number/eu --request MTY0',
        'POST',
        `${base}/739182640518203/join-requests/reject`,
        {joinRequestIds: ['MTY0']},
      ],
      [
        'cloud group pin 739182640518203 --session number/eu --message 42 --days 7',
        'POST',
        `${base}/739182640518203/pins`,
        {operation: 'pin', messageId: '42', expirationDays: 7},
      ],
      [
        'cloud group pin 739182640518203 --session number/eu --message 42 --unpin',
        'POST',
        `${base}/739182640518203/pins`,
        {operation: 'unpin', messageId: '42'},
      ],
    ]
    for (const [command, method, url, body] of cases) {
      const before = server.requests.length
      const result = await run(`${command} --json`)
      expect(result.error, command).toBeUndefined()
      const request = server.requests[before]!
      expect(`${request.method} ${request.url}`, command).toBe(
        `${method} ${url}`,
      )
      if (body !== undefined)
        expect(JSON.parse(request.body), command).toEqual(body)
    }
  })

  test('sends a change once with the idempotency key and reports the eligibility error', async () => {
    server = await startHttpServer({
      status: 403,
      body: {
        error: {
          type: 'permission_error',
          code: 'whatsapp_groups_ineligible',
          message: 'Groups require an Official Business Account.',
        },
      },
    })
    const result = await run(
      'cloud group create --session number --subject Orders --idempotency-key grp-1 --json',
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]!.headers['idempotency-key']).toBe('grp-1')
    expect(`${result.stdout}${result.stderr}${String(result.error)}`).toContain(
      'whatsapp_groups_ineligible',
    )
  })

  test('refuses invalid local input and client tokens before any request', async () => {
    server = await startHttpServer({body: {success: true, data: {}}})
    for (const command of [
      'cloud group update 1 --session number',
      'cloud group pin 1 --session number --message 42',
      'cloud group invite-link 1 --session number --idempotency-key k',
    ]) {
      expect((await run(command)).error, command).toBeDefined()
    }
    expect(
      (await run('cloud group list --session number', 'client')).error,
    ).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })
})
