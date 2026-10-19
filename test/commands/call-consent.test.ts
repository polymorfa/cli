import {runCommand} from '@oclif/test'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const CLIENT_TOKEN = 'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO'
const OPT_OUT_ID = '0b9f6a52-8f0e-4a44-9d51-3c1f9d6f2a10'
const NEXT_CURSOR = '1c9f6a52-8f0e-4a44-9d51-3c1f9d6f2a11'

const policy = {
  blockedCountryCodes: ['1876', '44'],
  optOutCount: 2,
  revision: 3,
  updatedAt: '2026-09-19T10:00:00.000Z',
}

const optOut = {
  bsuid: null,
  createdAt: '2026-09-19T10:00:00.000Z',
  id: OPT_OUT_ID,
  note: 'Asked by phone',
  phoneNumber: '+14155550123',
  source: 'api',
}

const permission = {
  actions: {
    requestPermission: {
      allowed: false,
      limits: [
        {
          maxAllowed: 1,
          period: 'PT24H',
          resetsAt: '2026-09-20T10:00:00.000Z',
          used: 1,
        },
      ],
    },
    startCall: {allowed: true, limits: []},
  },
  checkedAt: '2026-09-19T10:00:00.000Z',
  conversation: {id: '750000000001', phoneNumber: '+14155550123'},
  expiresAt: '2026-09-26T10:00:00.000Z',
  fresh: true,
  source: 'user_action',
  status: 'temporary',
  updatedAt: '2026-09-19T09:00:00.000Z',
}

describe('call consent commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('reads and replaces the team call policy', async () => {
    server = await startHttpSequenceServer([
      {body: {data: policy, success: true}},
      {body: {data: {...policy, revision: 4}, success: true}},
      {
        body: {
          data: {...policy, blockedCountryCodes: [], revision: 5},
          success: true,
        },
      },
    ])

    const read = await apiKey(() => runCommand('calls policy get'))
    const set = await apiKey(() =>
      runCommand(
        'calls policy set --blocked-country-codes 44,+1876,44 --expected-revision 3 --json',
      ),
    )
    const cleared = await apiKey(() => runCommand('calls policy set --clear'))
    const bad = await apiKey(() =>
      runCommand('calls policy set --blocked-country-codes 44,12345'),
    )
    const neither = await apiKey(() => runCommand('calls policy set'))
    const both = await apiKey(() =>
      runCommand('calls policy set --clear --blocked-country-codes 44'),
    )

    expect(read.error).toBeUndefined()
    expect(read.stdout).toContain('Blocked country codes\t1876, 44')
    expect(read.stdout).toContain('Do-not-call entries\t2')
    expect(read.stdout).toContain('Revision\t3')
    expect(JSON.parse(set.stdout)).toMatchObject({
      data: {revision: 4},
      metadata: {status: 200},
    })
    expect(cleared.stdout).toContain('none (every country allowed)')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/call-policy',
      'PUT /platform/call-policy',
      'PUT /platform/call-policy',
    ])
    expect(JSON.parse(server.requests[1]?.body ?? '')).toEqual({
      blockedCountryCodes: ['44', '1876'],
      expectedRevision: 3,
    })
    expect(JSON.parse(server.requests[2]?.body ?? '')).toEqual({
      blockedCountryCodes: [],
    })
    expect(exitCode(bad.error)).toBe(2)
    expect(exitCode(neither.error)).toBe(2)
    expect(exitCode(both.error)).toBe(2)
  }, 30_000)

  test('reports a stale policy revision and a refused project credential', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          error: {code: 'state_conflict', message: 'The policy changed.'},
          success: false,
        },
        status: 409,
      },
      {
        body: {
          error: {
            code: 'permission_denied',
            message: "The team's call policy needs an team key.",
          },
          success: false,
        },
        status: 403,
      },
    ])

    const stale = await apiKey(() =>
      runCommand(
        'calls policy set --blocked-country-codes 44 --expected-revision 2 --json',
      ),
    )
    const refused = await apiKey(() => runCommand('calls policy get'))

    expect(exitCode(stale.error)).toBe(4)
    expect(JSON.parse(stale.stderr)).toMatchObject({
      error: {category: 'conflict', code: 'state_conflict'},
    })
    expect(exitCode(refused.error)).toBe(3)
    expect(refused.stderr).toContain('team key')
  }, 30_000)

  test('reports malformed SDK collection envelopes as server failures', async () => {
    server = await startHttpServer({body: {data: {entries: []}, success: true}})

    const listed = await apiKey(() => runCommand('calls opt-outs list --json'))

    expect(exitCode(listed.error)).toBe(5)
    expect(JSON.parse(listed.stderr)).toMatchObject({
      error: {category: 'server', code: 'invalid_response'},
    })
    expect(server.requests).toHaveLength(1)
  }, 30_000)

  test('lists the do-not-call list one page at a time or across pages', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: [optOut],
          page: {hasMore: true, nextCursor: NEXT_CURSOR},
          success: true,
        },
      },
      {
        body: {
          data: [optOut],
          page: {hasMore: true, nextCursor: NEXT_CURSOR},
          success: true,
        },
      },
      {
        body: {
          data: [
            {...optOut, bsuid: 'US.1349', id: NEXT_CURSOR, phoneNumber: null},
          ],
          page: {hasMore: false, nextCursor: null},
          success: true,
        },
      },
      {
        body: {
          data: [optOut],
          page: {hasMore: false, nextCursor: null},
          success: true,
        },
      },
    ])

    const one = await apiKey(() => runCommand('calls opt-outs list --limit 1'))
    const all = await apiKey(() =>
      runCommand('calls opt-outs list --paginate --max-items 10 --json'),
    )
    const filtered = await apiKey(() =>
      runCommand('calls opt-outs list --phone-number +14155550123'),
    )
    const noMax = await apiKey(() =>
      runCommand('calls opt-outs list --paginate'),
    )
    const badPhone = await apiKey(() =>
      runCommand('calls opt-outs list --phone-number 4155550123'),
    )

    expect(one.error).toBeUndefined()
    expect(one.stdout).toBe(
      `${OPT_OUT_ID}\t+14155550123\tapi\t2026-09-19T10:00:00.000Z\tAsked by phone\nMore entries: --cursor ${NEXT_CURSOR}\n`,
    )
    const listed = JSON.parse(all.stdout) as {
      data: unknown[]
      page: {hasMore: boolean; nextCursor: string | null}
    }
    expect(listed.data).toHaveLength(2)
    expect(listed.page).toEqual({hasMore: false, nextCursor: null})
    const queries = server.requests.map(({method, url}) => {
      const parsed = new URL(url, 'http://localhost')
      return `${method} ${parsed.pathname} ${JSON.stringify(Object.fromEntries(parsed.searchParams))}`
    })
    expect(queries).toEqual([
      'GET /platform/call-opt-outs {"limit":"1"}',
      'GET /platform/call-opt-outs {"limit":"10"}',
      `GET /platform/call-opt-outs {"limit":"9","cursor":"${NEXT_CURSOR}"}`,
      'GET /platform/call-opt-outs {"limit":"100","phoneNumber":"+14155550123"}',
    ])
    expect(filtered.stdout).toContain(`${OPT_OUT_ID}\t+14155550123\tapi`)
    expect(exitCode(noMax.error)).toBe(2)
    expect(exitCode(badPhone.error)).toBe(2)
    expect(server.requests).toHaveLength(4)
  }, 30_000)

  test('caps --max-items when a page is larger than requested', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: [
            optOut,
            {...optOut, id: NEXT_CURSOR},
            {...optOut, id: '2c9f6a52-8f0e-4a44-9d51-3c1f9d6f2a12'},
          ],
          page: {hasMore: true, nextCursor: NEXT_CURSOR},
          success: true,
        },
      },
    ])

    const listed = await apiKey(() =>
      runCommand('calls opt-outs list --paginate --max-items 2 --json'),
    )

    const body = JSON.parse(listed.stdout) as {
      data: {id: string}[]
      page: {hasMore: boolean; nextCursor: string | null}
    }
    expect(body.data.map(({id}) => id)).toEqual([OPT_OUT_ID, NEXT_CURSOR])
    // The server cursor would skip the dropped entry, so it is not offered.
    expect(body.page).toEqual({hasMore: true, nextCursor: null})
    expect(server.requests).toHaveLength(1)
  }, 30_000)

  test('reports a repeated cursor as a server failure', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: [optOut],
          page: {hasMore: true, nextCursor: NEXT_CURSOR},
          success: true,
        },
      },
      {
        body: {
          data: [optOut],
          page: {hasMore: true, nextCursor: NEXT_CURSOR},
          success: true,
        },
      },
    ])

    const listed = await apiKey(() =>
      runCommand('calls opt-outs list --paginate --max-items 10 --json'),
    )

    expect(exitCode(listed.error)).not.toBe(2)
    expect(listed.stderr).toContain('same continuation cursor')
    expect(server.requests).toHaveLength(2)
  }, 30_000)

  test('refuses a client token for the team policy before sending', async () => {
    server = await startHttpServer({body: {data: policy, success: true}})

    const read = await clientToken(() => runCommand('calls policy get'))

    expect(exitCode(read.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  }, 30_000)

  test('adds and removes entries', async () => {
    server = await startHttpSequenceServer([
      {body: {data: optOut, success: true}, status: 201},
      {body: {data: optOut, success: true}, status: 200},
      {body: {data: {deleted: true, id: OPT_OUT_ID}, success: true}},
    ])

    const added = await apiKey(() =>
      runCommand(
        'calls opt-outs add --phone-number +14155550123 --note "Asked by phone"',
      ),
    )
    const again = await apiKey(() =>
      runCommand('calls opt-outs add --phone-number +14155550123'),
    )
    const both = await apiKey(() =>
      runCommand(
        'calls opt-outs add --phone-number +14155550123 --bsuid US.1349',
      ),
    )
    const unconfirmed = await apiKey(() =>
      runCommand(`calls opt-outs remove ${OPT_OUT_ID}`),
    )
    const removed = await apiKey(() =>
      runCommand(`calls opt-outs remove ${OPT_OUT_ID} --yes`),
    )
    const badId = await apiKey(() =>
      runCommand('calls opt-outs remove nope --yes'),
    )

    expect(added.stdout).toBe(
      `Added +14155550123 to the do-not-call list (${OPT_OUT_ID}).\n`,
    )
    expect(again.stdout).toContain('already on the do-not-call list')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      note: 'Asked by phone',
      phoneNumber: '+14155550123',
    })
    expect(removed.stdout).toBe(
      `Removed ${OPT_OUT_ID} from the do-not-call list.\n`,
    )
    expect(exitCode(both.error)).toBe(2)
    expect(exitCode(unconfirmed.error)).toBe(2)
    expect(exitCode(badId.error)).toBe(2)
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /platform/call-opt-outs',
      'POST /platform/call-opt-outs',
      `DELETE /platform/call-opt-outs/${OPT_OUT_ID}`,
    ])
  }, 30_000)

  test('imports a CSV file and maps rejections to file positions', async () => {
    server = await startHttpServer({
      body: {
        data: {
          added: 1,
          existing: 1,
          rejected: [{index: 1, reason: 'invalid_phone_number'}],
        },
        success: true,
      },
    })
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-opt-outs-'))
    const file = join(directory, 'list.csv')
    await writeFile(
      file,
      '﻿Phone Number,note,bsuid\r\n+14155550123,"Called, twice",\r\n\r\n12345,,\r\n,,US.1349\r\n',
    )

    const imported = await apiKey(() =>
      runCommand(`calls opt-outs import ${file} --json`),
    )

    expect(exitCode(imported.error)).toBe(12)
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      entries: [
        {note: 'Called, twice', phoneNumber: '+14155550123'},
        {phoneNumber: '12345'},
        {bsuid: 'US.1349'},
      ],
    })
    expect(JSON.parse(imported.stdout)).toMatchObject({
      data: {
        added: 1,
        batches: 1,
        entries: 3,
        existing: 1,
        rejected: [{index: 1, line: 4, reason: 'invalid_phone_number'}],
      },
    })
    expect(JSON.parse(imported.stderr)).toMatchObject({
      error: {category: 'partial_success', code: 'partial_success'},
    })
  }, 30_000)

  test('counts only the batches it sends when entries are rejected locally', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {added: 5000, existing: 0, rejected: []}, success: true}},
      {
        body: {
          error: {code: 'call_opt_out_limit', message: 'The list is full.'},
          success: false,
        },
        status: 409,
      },
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-opt-outs-'))
    const file = join(directory, 'list.json')
    const valid = (index: number) => ({
      phoneNumber: `+1415555${String(index).padStart(4, '0')}`,
    })
    const entries = [
      ...Array.from({length: 5000}, (_, index) => valid(index)),
      // Over the request's field limit: rejected by the CLI, never sent.
      ...Array.from({length: 5000}, () => ({
        phoneNumber: '+1'.padEnd(65, '5'),
      })),
      valid(9999),
    ]
    await writeFile(file, JSON.stringify({entries}))

    const imported = await apiKey(() =>
      runCommand(`calls opt-outs import ${file}`),
    )

    expect(server.requests).toHaveLength(2)
    expect(exitCode(imported.error)).toBe(12)
    expect(imported.stderr).toContain('Stored 1 of 2 batches')
  }, 60_000)

  test('imports JSON in batches of 5,000 and reports a failed later batch', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {added: 5000, existing: 0, rejected: []}, success: true}},
      {
        body: {
          error: {code: 'call_opt_out_limit', message: 'The list is full.'},
          success: false,
        },
        status: 409,
      },
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-opt-outs-'))
    const file = join(directory, 'list.json')
    const entries = Array.from({length: 5001}, (_, index) => ({
      phoneNumber: `+1415555${String(index).padStart(4, '0')}`,
    }))
    await writeFile(file, JSON.stringify({entries}))

    const imported = await apiKey(() =>
      runCommand(`calls opt-outs import ${file}`),
    )

    expect(server.requests).toHaveLength(2)
    expect(
      (JSON.parse(server.requests[0]?.body ?? '') as {entries: unknown[]})
        .entries,
    ).toHaveLength(5000)
    expect(
      (JSON.parse(server.requests[1]?.body ?? '') as {entries: unknown[]})
        .entries,
    ).toHaveLength(1)
    expect(imported.stdout).toContain('Added\t5000')
    expect(exitCode(imported.error)).toBe(12)
    expect(imported.stderr).toContain('Stored 1 of 2 batches')
    expect(imported.stderr).toContain('The list is full.')
  }, 30_000)

  test('fails an import with the request exit code when nothing was stored', async () => {
    server = await startHttpServer({
      body: {
        error: {code: 'call_opt_out_limit', message: 'The list is full.'},
        success: false,
      },
      status: 409,
    })
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-opt-outs-'))
    const file = join(directory, 'list.json')
    await writeFile(file, JSON.stringify([{phoneNumber: '+14155550123'}]))
    const unknownField = join(directory, 'unknown.json')
    await writeFile(unknownField, JSON.stringify([{phone: '+14155550123'}]))
    const noHeader = join(directory, 'numbers.csv')
    await writeFile(noHeader, '+14155550123\n')
    const text = join(directory, 'numbers.txt')
    await writeFile(text, '+14155550123\n')

    const full = await apiKey(() => runCommand(`calls opt-outs import ${file}`))
    const unknown = await apiKey(() =>
      runCommand(`calls opt-outs import ${unknownField}`),
    )
    const headerless = await apiKey(() =>
      runCommand(`calls opt-outs import ${noHeader}`),
    )
    const noFormat = await apiKey(() =>
      runCommand(`calls opt-outs import ${text}`),
    )

    expect(exitCode(full.error)).toBe(4)
    expect(full.stdout).toBe('')
    expect(exitCode(unknown.error)).toBe(2)
    expect(exitCode(headerless.error)).toBe(2)
    expect(exitCode(noFormat.error)).toBe(2)
    expect(server.requests).toHaveLength(1)
  }, 30_000)

  test('reads a call permission and checks a call', async () => {
    server = await startHttpSequenceServer([
      {body: {data: permission, success: true}},
      {
        body: {
          data: {
            allowed: false,
            permission: {...permission, conversation: undefined},
            refusal: 'call_recipient_opted_out',
          },
          success: true,
        },
      },
    ])

    const read = await apiKey(() =>
      runCommand('calls permission get +14155550123 --session support'),
    )
    const checked = await apiKey(() =>
      runCommand('calls check +14155550123 --session support'),
    )

    expect(read.error).toBeUndefined()
    expect(read.stdout).toContain('Person\t+14155550123')
    expect(read.stdout).toContain('Status\ttemporary')
    expect(read.stdout).toContain(
      'Request permission\tnot allowed (1/1 per PT24H, resets 2026-09-20T10:00:00.000Z)',
    )
    expect(read.stdout).toContain('Start call\tallowed')
    expect(checked.error).toBeUndefined()
    expect(checked.stdout).toContain('Allowed\tno')
    expect(checked.stdout).toContain('Refusal\tcall_recipient_opted_out')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /messaging/support/call-permissions/%2B14155550123',
      'POST /messaging/voip/calls/check',
    ])
    expect(JSON.parse(server.requests[1]?.body ?? '')).toEqual({
      session: 'support',
      to: '+14155550123',
    })
  }, 30_000)

  test('refuses client tokens for permission reads and call checks', async () => {
    server = await startHttpServer({body: {success: true}})

    const read = await clientToken(() =>
      runCommand('calls permission get +14155550123 --session support'),
    )
    const checked = await clientToken(() =>
      runCommand('calls check +14155550123 --session support'),
    )

    expect(exitCode(read.error)).toBe(2)
    expect(exitCode(checked.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  }, 30_000)

  test('reports an unsupported linked-device number', async () => {
    server = await startHttpServer({
      body: {
        error: {
          code: 'unsupported_for_connection',
          message: 'Call permissions apply to Cloud API numbers only.',
        },
        success: false,
      },
      status: 409,
    })

    const read = await apiKey(() =>
      runCommand('calls permission get +14155550123 --session linked --json'),
    )

    expect(exitCode(read.error)).toBe(4)
    expect(JSON.parse(read.stderr)).toMatchObject({
      error: {code: 'unsupported_for_connection'},
    })
  }, 30_000)

  test('sends a call permission request and shows Retry-After when limited', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {id: 'msg_1'}, success: true}},
      {
        body: {
          error: {
            code: 'call_permission_request_limited',
            message:
              'WhatsApp limits how often this number can ask this person for call permission.',
          },
          success: false,
        },
        headers: {'retry-after': '3600'},
        status: 429,
      },
      {
        body: {
          error: {
            code: 'call_permission_granted',
            message:
              'The person already granted this number permanent call permission.',
          },
          success: false,
        },
        status: 409,
      },
    ])

    const sent = await apiKey(() =>
      runCommand(
        'calls permission request +14155550123 --session support --body "We would like to call you about your order."',
      ),
    )
    const limited = await apiKey(() =>
      runCommand(
        'calls permission request +14155550123 --session support --body Again --json',
      ),
    )
    const granted = await apiKey(() =>
      runCommand(
        'calls permission request +14155550123 --session support --body Hi',
      ),
    )
    const empty = await apiKey(() =>
      runCommand(
        'calls permission request +14155550123 --session support --body " "',
      ),
    )

    expect(sent.stdout).toBe(
      'Sent call permission request msg_1 to +14155550123.\n',
    )
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/support/messages/send',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      content: {
        callPermissionRequest: {
          body: 'We would like to call you about your order.',
        },
      },
      conversation: {phoneNumber: '+14155550123'},
    })
    expect(exitCode(limited.error)).toBe(5)
    expect(JSON.parse(limited.stderr)).toMatchObject({
      error: {
        category: 'rate_limit',
        code: 'call_permission_request_limited',
        retryAfterSeconds: 3600,
      },
    })
    expect(limited.stderr).toContain('Retry after 3600 seconds.')
    expect(exitCode(granted.error)).toBe(4)
    expect(granted.stderr).toContain('permanent call permission')
    expect(exitCode(empty.error)).toBe(2)
    expect(server.requests).toHaveLength(3)
    expect(server.requests[0]?.headers['idempotency-key']).toBeTruthy()
    expect(server.requests[1]?.headers['idempotency-key']).toBeTruthy()
    expect(server.requests[0]?.headers['idempotency-key']).not.toBe(
      server.requests[1]?.headers['idempotency-key'],
    )
  }, 30_000)

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

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
