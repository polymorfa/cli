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
const PROJECT_TOKEN =
  'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const TRUNK_ID = '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10'
const DEFAULT_RETENTION = {
  appliesTo: ['call_records', 'call_events', 'client_reports'],
  policy: 'extended',
  retentionDays: 90,
  revision: 0,
  updatedAt: null,
}

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

  test('reads team call retention in human and JSON output', async () => {
    server = await startHttpServer({
      body: {data: DEFAULT_RETENTION, success: true},
      headers: {'request-id': 'req_retention'},
    })

    const human = await apiKey(() => runCommand('calls retention get'))
    const json = await apiKey(() => runCommand('calls retention get --json'))

    expect(human.error).toBeUndefined()
    expect(human.stdout).toBe(
      'Policy\textended\nRetention\t90 days\nApplies to\tcall_records, call_events, client_reports\nRevision\t0\nUpdated\tnever (defaults)\n',
    )
    expect(json.error).toBeUndefined()
    expect(jsonData(json.stdout)).toEqual(DEFAULT_RETENTION)
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/call-retention',
      'GET /platform/call-retention',
    ])
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`)
  })

  test('changes team call retention after checking the revision', async () => {
    const saved = {
      ...DEFAULT_RETENTION,
      policy: 'compliance',
      retentionDays: 365,
      revision: 1,
      updatedAt: '2026-09-19T10:00:00.000Z',
    }
    server = await startHttpSequenceServer([
      {body: {data: DEFAULT_RETENTION, success: true}},
      {body: {data: saved, success: true}},
      {body: {data: DEFAULT_RETENTION, success: true}},
      {
        body: {
          data: {...saved, policy: 'custom', retentionDays: 180},
          success: true,
        },
      },
    ])

    const named = await apiKey(() =>
      runCommand(
        'calls retention set --policy compliance --expected-revision 0',
      ),
    )
    const custom = await apiKey(() =>
      runCommand(
        'calls retention set --policy custom --days 180 --expected-revision 0 --json',
      ),
    )

    expect(named.error).toBeUndefined()
    expect(named.stdout).toBe(
      'Policy\tcompliance\nRetention\t365 days\nApplies to\tcall_records, call_events, client_reports\nRevision\t1\nUpdated\t2026-09-19T10:00:00.000Z\n',
    )
    expect(custom.error).toBeUndefined()
    expect(jsonData(custom.stdout)).toMatchObject({
      policy: 'custom',
      retentionDays: 180,
    })
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/call-retention',
      'PUT /platform/call-retention',
      'GET /platform/call-retention',
      'PUT /platform/call-retention',
    ])
    expect(JSON.parse(server.requests[1]?.body ?? '')).toEqual({
      expectedRevision: 0,
      policy: 'compliance',
    })
    expect(JSON.parse(server.requests[3]?.body ?? '')).toEqual({
      expectedRevision: 0,
      policy: 'custom',
      retentionDays: 180,
    })
  })

  test('rejects invalid call retention changes before any request', async () => {
    server = await startHttpServer({
      body: {data: DEFAULT_RETENTION, success: true},
    })

    const customWithoutDays = await apiKey(() =>
      runCommand(
        'calls retention set --policy custom --expected-revision 0 --json',
      ),
    )
    const zero = await apiKey(() =>
      runCommand(
        'calls retention set --policy custom --days 0 --expected-revision 0',
      ),
    )
    const tooLong = await apiKey(() =>
      runCommand(
        'calls retention set --policy custom --days 2556 --expected-revision 0',
      ),
    )
    const mismatched = await apiKey(() =>
      runCommand(
        'calls retention set --policy standard --days 45 --expected-revision 0',
      ),
    )
    const noRevision = await apiKey(() =>
      runCommand('calls retention set --policy extended'),
    )
    const unknownPolicy = await apiKey(() =>
      runCommand('calls retention set --policy forever --expected-revision 0'),
    )
    const token = await clientToken(() =>
      runCommand('calls retention get --json'),
    )

    expect(exitCode(customWithoutDays.error)).toBe(2)
    expect(JSON.parse(customWithoutDays.stderr.trim())).toMatchObject({
      error: {category: 'configuration'},
    })
    expect(customWithoutDays.stderr).toContain(
      '--policy custom requires --days',
    )
    for (const invalid of [
      zero,
      tooLong,
      mismatched,
      noRevision,
      unknownPolicy,
    ]) {
      expect(exitCode(invalid.error)).toBe(2)
    }
    expect(mismatched.stderr).toContain('omit --days or use --policy custom')
    expect(exitCode(token.error)).toBe(2)
    expect(token.stderr).toContain('browser client tokens are refused')
    expect(server.requests).toHaveLength(0)
  })

  test('requires --yes to shorten call retention without a terminal', async () => {
    server = await startHttpSequenceServer([
      {body: {data: DEFAULT_RETENTION, success: true}},
      {body: {data: DEFAULT_RETENTION, success: true}},
      {
        body: {
          data: {
            ...DEFAULT_RETENTION,
            policy: 'short',
            retentionDays: 7,
            revision: 1,
          },
          success: true,
        },
      },
    ])

    const refused = await apiKey(() =>
      runCommand(
        'calls retention set --policy short --expected-revision 0 --json',
      ),
    )
    const confirmed = await apiKey(() =>
      runCommand(
        'calls retention set --policy short --expected-revision 0 --yes',
      ),
    )

    expect(exitCode(refused.error)).toBe(2)
    expect(JSON.parse(refused.stderr.trim())).toMatchObject({
      error: {category: 'validation', code: 'confirmation_required'},
    })
    expect(refused.stderr).toContain('from 90 to 7 days')
    expect(refused.stderr).toContain('--yes')
    expect(confirmed.error).toBeUndefined()
    expect(confirmed.stdout).toContain('Retention\t7 days')
    expect(server.requests.map(({method}) => method)).toEqual([
      'GET',
      'GET',
      'PUT',
    ])
    expect(JSON.parse(server.requests[2]?.body ?? '')).toEqual({
      expectedRevision: 0,
      policy: 'short',
    })
  })

  test('reports a stale call retention revision with exit code 4', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {...DEFAULT_RETENTION, revision: 2}, success: true}},
      {body: {data: {...DEFAULT_RETENTION, revision: 2}, success: true}},
      apiError(
        409,
        'state_conflict',
        'The call retention changed since revision 2.',
        'req_stale',
      ),
    ])

    const local = await apiKey(() =>
      runCommand(
        'calls retention set --policy compliance --expected-revision 1 --json',
      ),
    )
    const remote = await apiKey(() =>
      runCommand(
        'calls retention set --policy compliance --expected-revision 2',
      ),
    )

    expect(exitCode(local.error)).toBe(4)
    expect(JSON.parse(local.stderr.trim())).toMatchObject({
      error: {category: 'conflict', code: 'state_conflict'},
    })
    expect(exitCode(remote.error)).toBe(4)
    expect(remote.stderr).toContain(
      'The call retention setting changed (state_conflict); read it again',
    )
    expect(remote.stderr).toContain('Request ID: req_stale')
    expect(server.requests.map(({method}) => method)).toEqual([
      'GET',
      'GET',
      'PUT',
    ])
  })

  test('explains that call retention needs a team API key', async () => {
    server = await startHttpSequenceServer([
      {body: {data: DEFAULT_RETENTION, success: true}},
      apiError(
        403,
        'forbidden',
        'call retention is a team setting; use a team API key to change it',
      ),
    ])

    const result = await apiKey(() =>
      runCommand(
        'calls retention set --policy compliance --expected-revision 0 --json',
      ),
    )

    expect(exitCode(result.error)).toBe(3)
    const envelope = JSON.parse(result.stderr.trim()) as {
      error: {category: string; message: string}
    }
    expect(envelope.error.category).toBe('authorization')
    expect(envelope.error.message).toContain(
      'Call retention is a team setting; use a team API key',
    )
  })

  test('explains that changing call retention also needs sessions:read for the first read', async () => {
    server = await startHttpSequenceServer([
      apiError(403, 'missing_scope', 'This action requires sessions:read.'),
    ])

    const result = await apiKey(() =>
      runCommand(
        'calls retention set --policy compliance --expected-revision 0 --json',
      ),
    )

    expect(exitCode(result.error)).toBe(3)
    const envelope = JSON.parse(result.stderr.trim()) as {
      error: {category: string; message: string}
    }
    expect(envelope.error.category).toBe('authorization')
    expect(envelope.error.message).toContain(
      'use a team API key with the sessions:read and sessions:manage scopes to change it',
    )
    expect(envelope.error.message).toContain(
      'This action requires sessions:read.',
    )
    expect(server.requests.map(({method}) => method)).toEqual(['GET'])
  })

  test('reads team call retention with a project token and lets the API refuse its changes', async () => {
    server = await startHttpSequenceServer([
      {body: {data: DEFAULT_RETENTION, success: true}},
      {body: {data: DEFAULT_RETENTION, success: true}},
      apiError(
        403,
        'forbidden',
        'call retention is a team setting; use a team API key to change it',
      ),
    ])

    const read = await projectToken(() =>
      runCommand('calls retention get --json'),
    )
    const change = await projectToken(() =>
      runCommand(
        'calls retention set --policy compliance --expected-revision 0 --json',
      ),
    )

    expect(read.stderr).toBe('')
    expect(read.error).toBeUndefined()
    expect(jsonData(read.stdout)).toEqual(DEFAULT_RETENTION)
    // The change reaches the API, which decides; no local credential refusal.
    expect(exitCode(change.error)).toBe(3)
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/call-retention',
      'GET /platform/call-retention',
      'PUT /platform/call-retention',
    ])
    for (const request of server.requests) {
      expect(request.headers.authorization).toBe(`Bearer ${PROJECT_TOKEN}`)
    }
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

  async function projectToken<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: PROJECT_TOKEN,
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
