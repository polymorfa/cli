import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type ResponseFixture,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const CLIENT_TOKEN = 'pmfa_ct_browser_token'
const TRUNK_ID = '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10'

describe('unified calls commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('places a call from a named session with a claim and participant', async () => {
    server = await startHttpServer({
      body: {
        data: {callId: 'call_1', session: 'support', video: true},
        success: true,
      },
      headers: {'request-id': 'req_place'},
      status: 201,
    })

    const result = await apiKey(() =>
      runCommand(
        'calls place " +15550100 " --session support --video --exclusive --participant agent-7 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {callId: 'call_1', session: 'support', video: true},
      metadata: {attempts: 1, requestId: 'req_place', status: 201},
    })
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/voip/calls',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      exclusive: true,
      participant: 'agent-7',
      session: 'support',
      to: '+15550100',
      video: true,
    })
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`)
  })

  test('places a call with a client token from its bound session', async () => {
    server = await startHttpServer({
      body: {
        data: {callId: 'call_2', session: 'support', video: false},
        success: true,
      },
      status: 201,
    })

    const result = await clientToken(() => runCommand('calls place 15550100'))

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Call\tcall_2')
    expect(result.stdout).toContain('Session\tsupport')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      to: '15550100',
    })
    expect(server.requests[0]?.headers.authorization).toBe(
      `Bearer ${CLIENT_TOKEN}`,
    )
  })

  test('validates placement input before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const noSession = await apiKey(() =>
      runCommand('calls place +15550100 --json'),
    )
    const participant = await clientToken(() =>
      runCommand('calls place +15550100 --participant agent-7 --json'),
    )
    const target = await apiKey(() =>
      runCommand('calls place 0555 --session support --json'),
    )
    const badParticipant = await apiKey(() =>
      runCommand(
        'calls place +15550100 --session support --participant "agent 7" --json',
      ),
    )

    expect(exitCode(noSession.error)).toBe(2)
    expect(noSession.stderr).toContain('requires --session')
    expect(exitCode(participant.error)).toBe(2)
    expect(participant.stderr).toContain(
      '--participant requires a server API key',
    )
    expect(exitCode(target.error)).toBe(2)
    expect(target.stderr).toContain('E.164 phone number')
    expect(exitCode(badParticipant.error)).toBe(2)
    expect(badParticipant.stderr).toContain('Participant must be 1 to 128')
    expect(server.requests).toHaveLength(0)
  })

  test('accepts a call and prints who answered and whether it is claimed', async () => {
    server = await startHttpServer({
      body: {
        data: {answered: true, answeredBy: 'server:agent-7', exclusive: true},
        success: true,
      },
    })

    const result = await apiKey(() =>
      runCommand(
        'calls accept call/1 --exclusive --no-video --participant agent-7',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(
      'Answered\tyes\nAnswered by\tserver:agent-7\nExclusive\tyes\n',
    )
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/voip/calls/call%2F1/accept',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      exclusive: true,
      participant: 'agent-7',
      video: false,
    })
  })

  test('joins a shared call with a client token', async () => {
    server = await startHttpServer({
      body: {
        data: {answered: true, answeredBy: 'server:default', exclusive: false},
        success: true,
      },
    })

    const result = await clientToken(() =>
      runCommand('calls accept call_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(jsonData(result.stdout)).toEqual({
      answered: true,
      answeredBy: 'server:default',
      exclusive: false,
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({})
  })

  test('exits with a conflict when another participant claimed the call', async () => {
    server = await startHttpServer(
      apiError(409, 'call_claimed', 'The request conflicts.', 'req_claimed'),
    )

    const human = await apiKey(() => runCommand('calls accept call_1'))
    const json = await apiKey(() => runCommand('calls accept call_1 --json'))

    expect(exitCode(human.error)).toBe(4)
    expect(human.stderr).toContain('Another participant claimed this call')
    expect(human.stderr).toContain('Request ID: req_claimed')
    expect(exitCode(json.error)).toBe(4)
    expect(JSON.parse(json.stderr)).toMatchObject({
      error: {
        category: 'conflict',
        code: 'call_claimed',
        requestId: 'req_claimed',
      },
    })
    expect(server.requests).toHaveLength(2)
  })

  test('reports number restrictions for place and invite in human and JSON output', async () => {
    server = await startHttpServer(
      apiError(
        403,
        'number_restricted',
        'This number can call only people it has already chatted with.',
        'req_restricted',
      ),
    )

    for (const command of [
      'calls place +15550100 --session support',
      'calls invite call_1 +15550101',
    ]) {
      const human = await apiKey(() => runCommand(command))
      const json = await apiKey(() => runCommand(`${command} --json`))

      expect(exitCode(human.error)).toBe(3)
      expect(human.stderr).toContain('already chatted with')
      expect(human.stderr).toContain('Request ID: req_restricted')
      expect(exitCode(json.error)).toBe(3)
      expect(JSON.parse(json.stderr)).toMatchObject({
        error: {
          category: 'authorization',
          code: 'number_restricted',
          requestId: 'req_restricted',
        },
      })
    }
    expect(server.requests.map((request) => request.url)).toEqual([
      '/messaging/voip/calls',
      '/messaging/voip/calls',
      '/messaging/voip/calls/call_1/participants',
      '/messaging/voip/calls/call_1/participants',
    ])
  })

  test('reports an authentication failure with the credential redacted', async () => {
    server = await startHttpServer(
      apiError(401, 'invalid_credential', `Key ${API_KEY} is invalid.`),
    )

    const result = await apiKey(() => runCommand('calls accept call_1'))

    expect(exitCode(result.error)).toBe(3)
    expect(result.stderr).toContain('[REDACTED]')
    expect(result.stderr).not.toContain(API_KEY)
  })

  test('declines a ringing call on the unified Calls API', async () => {
    server = await startHttpServer({body: {success: true}, status: 202})

    const result = await apiKey(() =>
      runCommand('calls reject call_1 --participant agent-7'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('Declined call call_1.\n')
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({participant: 'agent-7'}),
      method: 'POST',
      url: '/messaging/voip/calls/call_1/reject',
    })
  })

  test('exits with a conflict when the call is no longer ringing', async () => {
    server = await startHttpServer(
      apiError(409, 'call_not_ringing', 'The request conflicts.'),
    )

    const result = await clientToken(() =>
      runCommand('calls reject call_1 --json'),
    )

    expect(exitCode(result.error)).toBe(4)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {category: 'conflict', code: 'call_not_ringing'},
    })
    expect(result.stderr).toContain('The call is not ringing')
    expect(server.requests[0]?.body).toBe('')
  })

  test('leaves one connection and validates its ID first', async () => {
    server = await startHttpServer({body: {success: true}, status: 202})

    const invalid = await apiKey(() =>
      runCommand('calls leave call_1 --connection-id short --json'),
    )
    const spaced = await apiKey(() =>
      runCommand('calls leave call_1 --connection-id "conn 0123456" --json'),
    )
    const left = await apiKey(() =>
      runCommand(
        'calls leave call_1 --connection-id conn_0123456789 --participant agent-7',
      ),
    )

    expect(exitCode(invalid.error)).toBe(2)
    expect(invalid.stderr).toContain('Connection ID must be 8 to 64')
    expect(exitCode(spaced.error)).toBe(2)
    expect(left.error).toBeUndefined()
    expect(left.stdout).toBe(
      'Closed connection conn_0123456789 on call call_1.\n',
    )
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/voip/calls/call_1/leave',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      connectionId: 'conn_0123456789',
      participant: 'agent-7',
    })
  })

  test('ends a call for everyone with a client token', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await clientToken(() =>
      runCommand('calls end call_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(jsonData(result.stdout)).toEqual({success: true})
    expect(server.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/voip/calls/call_1',
    })
  })

  test('invites a participant into a call', async () => {
    server = await startHttpServer({
      body: {
        data: {
          audioMuted: false,
          id: 'participant_1',
          phoneNumber: '+15550101',
          state: 'invited',
          video: false,
        },
        success: true,
      },
      status: 201,
    })

    const result = await apiKey(() =>
      runCommand('calls invite call_1 +15550101'),
    )
    const invalid = await apiKey(() =>
      runCommand('calls invite call_1 alice --json'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(
      'Participant\tparticipant_1\nPhone\t+15550101\nState\tinvited\n',
    )
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({to: '+15550101'}),
      method: 'POST',
      url: '/messaging/voip/calls/call_1/participants',
    })
    expect(exitCode(invalid.error)).toBe(2)
    expect(server.requests).toHaveLength(1)
  })

  test('reads and replaces session call settings with a server API key', async () => {
    server = await startHttpServer({
      body: {
        data: {conferenceMode: false, updatedAt: '2026-09-16T10:00:00.000Z'},
        success: true,
      },
    })

    const viewed = await apiKey(() =>
      runCommand('calls settings get --session support/main'),
    )
    const updated = await apiKey(() =>
      runCommand(
        'calls settings set --session support/main --no-conference-mode --json',
      ),
    )

    expect(viewed.error).toBeUndefined()
    expect(viewed.stdout).toBe(
      'Session\tsupport/main\nCalls\ton\nConference mode\toff\nIncoming calls\tclients\nCloud API calls answered by\tyour Graph API integration\nRevision\t0\nUpdated\t2026-09-16T10:00:00.000Z\n',
    )
    expect(updated.error).toBeUndefined()
    expect(jsonData(updated.stdout)).toEqual({
      conferenceMode: false,
      updatedAt: '2026-09-16T10:00:00.000Z',
    })
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/sessions/support%2Fmain/call-settings',
      'PUT /platform/sessions/support%2Fmain/call-settings',
    ])
    expect(JSON.parse(server.requests[1]?.body ?? '')).toEqual({
      conferenceMode: false,
    })
  })

  test('sends only the settings it is given', async () => {
    const routed = {
      conferenceMode: true,
      inboundRoute: 'sip_trunk',
      revision: 5,
      sipClaim: false,
      sipTrunkId: TRUNK_ID,
      updatedAt: '2026-09-16T10:00:00.000Z',
    }
    server = await startHttpServer({body: {data: routed, success: true}})

    const conference = await apiKey(() =>
      runCommand('calls settings set --session support --conference-mode'),
    )
    const trunk = await apiKey(() =>
      runCommand(
        `calls settings set --session support --sip-trunk ${TRUNK_ID}`,
      ),
    )
    const back = await apiKey(() =>
      runCommand(
        'calls settings set --session support --inbound-route clients --sip-claim=false',
      ),
    )
    const keepTrunk = await apiKey(() =>
      runCommand(
        'calls settings set --session support --inbound-route sip_trunk',
      ),
    )
    const hosting = await apiKey(() =>
      runCommand(
        'calls settings set --session support --host-cloud-api-calls=true',
      ),
    )
    const conflicting = await apiKey(() =>
      runCommand(
        `calls settings set --session support --inbound-route clients --sip-trunk ${TRUNK_ID}`,
      ),
    )
    const empty = await apiKey(() =>
      runCommand('calls settings set --session support'),
    )

    for (const ok of [conference, trunk, back, keepTrunk, hosting]) {
      expect(ok.error).toBeUndefined()
    }
    expect(conference.stdout).toContain('Conference mode\ton')
    expect(conference.stdout).toContain('Incoming calls\tclients and SIP trunk')
    expect(conference.stdout).toContain(`SIP trunk\t${TRUNK_ID}`)
    expect(conference.stdout).toContain('SIP answer claims call\tno')
    expect(conference.stdout).toContain(
      'Cloud API calls answered by\tyour Graph API integration',
    )
    expect(server.requests.map(({method}) => method)).toEqual([
      'PUT',
      'PUT',
      'PUT',
      'PUT',
      'PUT',
    ])
    expect(
      server.requests.map(({body}) => JSON.parse(body) as unknown),
    ).toEqual([
      {conferenceMode: true},
      {inboundRoute: 'sip_trunk', sipTrunkId: TRUNK_ID},
      {inboundRoute: 'clients', sipClaim: false},
      {inboundRoute: 'sip_trunk'},
      {hostCloudApiCalls: true},
    ])
    expect(exitCode(conflicting.error)).toBe(2)
    expect(exitCode(empty.error)).toBe(2)
  })

  test('guards a change with the expected revision and exits 4 when stale', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            callsEnabled: false,
            conferenceMode: true,
            inboundRoute: 'clients',
            revision: 4,
            sipClaim: true,
            sipTrunkId: null,
            updatedAt: '2026-09-17T10:00:00.000Z',
          },
          success: true,
        },
      },
      apiError(
        409,
        'state_conflict',
        'The call settings changed since revision 3.',
        'req_stale',
      ),
    ])

    const guarded = await apiKey(() =>
      runCommand(
        'calls settings set --session support --calls-enabled=false --expected-revision 3',
      ),
    )
    const stale = await apiKey(() =>
      runCommand(
        'calls settings set --session support --calls-enabled=true --expected-revision 3 --json',
      ),
    )
    const negative = await apiKey(() =>
      runCommand(
        'calls settings set --session support --calls-enabled=true --expected-revision -1',
      ),
    )
    const alone = await apiKey(() =>
      runCommand('calls settings set --session support --expected-revision 3'),
    )

    expect(guarded.error).toBeUndefined()
    expect(guarded.stdout).toContain('Calls\toff')
    expect(guarded.stdout).toContain('Revision\t4')
    expect(exitCode(stale.error)).toBe(4)
    expect(JSON.parse(stale.stderr.trim())).toMatchObject({
      error: {category: 'conflict', code: 'state_conflict'},
    })
    expect(exitCode(negative.error)).toBe(2)
    expect(exitCode(alone.error)).toBe(2)
    expect(
      server.requests.map(({body}) => JSON.parse(body) as unknown),
    ).toEqual([
      {callsEnabled: false, expectedRevision: 3},
      {callsEnabled: true, expectedRevision: 3},
    ])
  })

  test('turns calling off and reports calls_disabled refusals', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            callsEnabled: false,
            conferenceMode: true,
            inboundRoute: 'clients',
            revision: 1,
            sipClaim: true,
            sipTrunkId: null,
            updatedAt: '2026-09-17T10:00:00.000Z',
          },
          success: true,
        },
      },
      apiError(403, 'calls_disabled', 'Calling is turned off for this number.'),
    ])

    const off = await apiKey(() =>
      runCommand('calls settings set --session support --calls-enabled=false'),
    )
    const place = await apiKey(() =>
      runCommand('calls place +15550100 --session support'),
    )

    expect(off.error).toBeUndefined()
    expect(off.stdout).toContain('Calls\toff')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      callsEnabled: false,
    })
    expect(exitCode(place.error)).toBe(3)
    expect(place.stderr).toContain('Calling is turned off for this number.')
  })

  test('reports an API refusal of the change', async () => {
    server = await startHttpServer(
      apiError(
        400,
        'invalid_parameter',
        'sipTrunkId is required when inboundRoute is sip_trunk.',
      ),
    )

    const result = await apiKey(() =>
      runCommand(
        'calls settings set --session support --inbound-route sip_trunk',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('sipTrunkId is required')
  })

  test('rejects client tokens and invalid values for call settings', async () => {
    server = await startHttpServer({body: {success: true}})

    const token = await clientToken(() =>
      runCommand('calls settings get --session support --json'),
    )
    const value = await apiKey(() =>
      runCommand(
        'calls settings set --session support --conference-mode=yes --json',
      ),
    )
    const retired = await apiKey(() =>
      runCommand(
        'calls settings set --session support --include-self-audio=true --json',
      ),
    )

    expect(exitCode(token.error)).toBe(2)
    expect(token.stderr).toContain(
      'Platform API requests require POLYMORFA_API_KEY',
    )
    expect(exitCode(value.error)).toBe(2)
    expect(exitCode(retired.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test('distinguishes the unified and session-route reject commands in help', async () => {
    const unified = await runCommand('calls reject --help')
    const legacy = await runCommand('call reject --help')

    expect(unified.stdout).toContain('use call reject')
    expect(legacy.stdout).toContain('use calls reject')
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
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

  async function clientToken<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: CLIENT_TOKEN,
      },
      run,
    )
  }
})

function apiError(
  status: number,
  code: string,
  message: string,
  requestId?: string,
): ResponseFixture {
  return {
    body: {
      data: null,
      error: {code, message, param: null, type: 'conflict_error'},
    },
    ...(requestId === undefined ? {} : {headers: {'request-id': requestId}}),
    status,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}

function jsonData(stdout: string): unknown {
  return (JSON.parse(stdout) as {data: unknown}).data
}
