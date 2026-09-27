import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  withEnvironment,
  type ResponseFixture,
  type TestHttpServer,
} from '../helpers/http-server.js'

const SURVIVOR = '01994234-0000-7000-8000-00000000000a'
const ABSORBED = '01994234-0000-7000-8000-00000000000b'
const CREATED = '01994234-0000-7000-8000-00000000000c'
const QUOTE = '01994234-0000-7000-8000-000000000001'
const PROJECT = '01994234-0000-7000-8000-0000000000aa'

function tierChange(
  hybridTransition?: Record<string, unknown>,
  status = 'quoted',
) {
  return {
    id: QUOTE,
    status,
    failureReason: null,
    expiresAtMs: 1_800_000_600_000,
    quote: {
      tier: 'standard',
      tierOverride: 'standard',
      amountCents: 0,
      priceVersion: 'catalog-1',
      action: 'downgrade',
      effectiveAtMs: 1_800_000_000_000,
      replacesWindowId: null,
      ...(hybridTransition === undefined ? {} : {hybridTransition}),
    },
  }
}

describe('session tier commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test.each([
    ['--tier pro', {tierOverride: 'pro'}],
    ['--tier inherit', {tierOverride: null}],
    [
      '--tier standard --keep linked_devices',
      {
        tierOverride: 'standard',
        hybridResolution: {action: 'keep', transport: 'linked_devices'},
      },
    ],
    [
      '--tier standard --split --stay official_api --new-number-name support-linked',
      {
        tierOverride: 'standard',
        hybridResolution: {
          action: 'split',
          existingNumberTransport: 'official_api',
          newNumberName: 'support-linked',
        },
      },
    ],
    [
      `--tier pro --merge-with ${ABSORBED}`,
      {tierOverride: 'pro', hybridMerge: {absorbNumberId: ABSORBED}},
    ],
    [
      `--tier free --keep official_api --project ${PROJECT}`,
      {
        tierOverride: 'free',
        projectId: PROJECT,
        hybridResolution: {action: 'keep', transport: 'official_api'},
      },
    ],
  ])('quote %s sends the exact request body', async (flags, body) => {
    server = await startHttpSequenceServer([{body: {data: tierChange()}}])
    const result = await platform(() =>
      runCommand(`session tier quote ${SURVIVOR} ${flags} --json`),
    )
    expect(result.stderr).toBe('')
    expect(result.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `POST /platform/sessions/${SURVIVOR}/tier-quotes`,
    ])
    expect(JSON.parse(server.requests[0]!.body)).toEqual(body)
    expect(JSON.parse(result.stdout)).toMatchObject({data: {id: QUOTE}})
  })

  test.each([
    [
      '--tier standard --keep linked_devices --split',
      'cannot also be provided',
    ],
    [
      `--tier pro --keep linked_devices --merge-with ${ABSORBED}`,
      'cannot also be provided',
    ],
    ['--tier standard --split', '--split needs --stay'],
    ['--tier standard --split --stay official_api', '--split needs --stay'],
    [
      '--tier standard --split --stay official_api --new-number-name -bad',
      '--new-number-name must be 1-64 characters',
    ],
    ['--tier standard --stay official_api', 'used only with --split'],
    [
      '--tier standard --keep linked_devices --new-number-name x',
      'used only with --split',
    ],
    [`--tier standard --merge-with ${ABSORBED}`, 'needs --tier pro'],
    ['--tier pro --merge-with support', 'Number UUID'],
    ['--tier standard --keep both', 'Expected --keep=both to be one of'],
  ])('quote %s fails before sending', async (flags, message) => {
    server = await startHttpSequenceServer([{body: {data: tierChange()}}])
    const result = await platform(() =>
      runCommand(`session tier quote ${SURVIVOR} ${flags}`),
    )
    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(message)
    expect(server.requests).toHaveLength(0)
  })

  test('shows the Hybrid Link plan and the confirm command for a quote', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: tierChange({
            action: 'split',
            existingNumberTransport: 'official_api',
            newNumberName: 'support-linked',
            survivingNumberId: SURVIVOR,
            effectiveAtMs: 1_800_000_000_000,
          }),
        },
      },
    ])
    const result = await platform(() =>
      runCommand(
        `session tier quote support --tier standard --split --stay official_api --new-number-name support-linked`,
      ),
    )
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      `Hybrid Link: split: official_api stays on ${SURVIVOR}; the other connection moves to new Number "support-linked"`,
    )
    expect(result.stdout).toContain('Hybrid Link status: not confirmed')
    expect(result.stdout).toContain(
      `polymorfa session tier confirm support --quote ${QUOTE} --yes`,
    )
  })

  test('explains hybrid_resolution_required with the flags to add', async () => {
    server = await startHttpSequenceServer([
      conflict(
        'hybrid_resolution_required',
        'choose which Hybrid Link connection to keep, or split the Number, before leaving Pro',
      ),
    ])
    const human = await platform(() =>
      runCommand(`session tier quote support --tier standard`),
    )
    expect(exitCode(human.error)).toBe(4)
    expect(human.stderr).toContain(
      'Choose --keep linked_devices|official_api, or --split --stay linked_devices|official_api --new-number-name NAME, and quote again.',
    )
    expect(human.stderr).toContain('Request ID: req_hybrid')

    const json = await platform(() =>
      runCommand(`session tier quote support --tier inherit --json`),
    )
    expect(exitCode(json.error)).toBe(4)
    expect(JSON.parse(json.stderr)).toMatchObject({
      error: {
        category: 'conflict',
        code: 'hybrid_resolution_required',
        retryable: false,
      },
    })
    expect(server.requests).toHaveLength(2)
  })

  test('reports hybrid_transition_ineligible with the API reason', async () => {
    server = await startHttpSequenceServer([
      conflict(
        'hybrid_transition_ineligible',
        'Hybrid Link change unavailable: not_same_number',
      ),
    ])
    const result = await platform(() =>
      runCommand(
        `session tier quote ${SURVIVOR} --tier pro --merge-with ${ABSORBED} --json`,
      ),
    )
    expect(exitCode(result.error)).toBe(4)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'hybrid_transition_ineligible',
        message: 'Hybrid Link change unavailable: not_same_number',
      },
    })
  })

  test('confirm requires --yes and sends only the quote ID', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: tierChange(
            {
              action: 'keep',
              keepTransport: 'linked_devices',
              survivingNumberId: SURVIVOR,
              status: 'scheduled',
              failureReason: null,
              metaDisconnectRequired: false,
              effectiveAtMs: 1_800_000_000_000,
            },
            'applied',
          ),
        },
      },
    ])
    const refused = await platform(() =>
      runCommand(`session tier confirm support --quote ${QUOTE}`),
    )
    expect(exitCode(refused.error)).toBe(2)
    expect(refused.stderr).toContain('Missing required flag yes')
    expect(server.requests).toHaveLength(0)

    const confirmed = await platform(() =>
      runCommand(
        `session tier confirm support --quote ${QUOTE} --yes --idempotency-key confirm-1`,
      ),
    )
    expect(confirmed.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'PATCH /platform/sessions/support',
    ])
    expect(JSON.parse(server.requests[0]!.body)).toEqual({quoteId: QUOTE})
    expect(server.requests[0]!.headers['idempotency-key']).toBe('confirm-1')
    expect(confirmed.stdout).toContain(
      `Hybrid Link: keep linked_devices on ${SURVIVOR}`,
    )
    expect(confirmed.stdout).toContain('Hybrid Link status: scheduled')
    expect(confirmed.stdout).toContain(
      `polymorfa session tier status support ${QUOTE}`,
    )
  })

  test('status shows a completed split, the new Number and the disconnect instruction', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: tierChange(
            {
              action: 'split',
              existingNumberTransport: 'linked_devices',
              newNumberName: 'support-cloud',
              survivingNumberId: SURVIVOR,
              newNumberId: CREATED,
              status: 'completed',
              failureReason: null,
              metaDisconnectRequired: true,
              effectiveAtMs: 1_800_000_000_000,
            },
            'applied',
          ),
        },
      },
    ])
    const result = await platform(() =>
      runCommand(`session tier status support ${QUOTE}`),
    )
    expect(result.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/sessions/support/tier-quotes/${QUOTE}`,
    ])
    expect(result.stdout).toContain(`Tier change ${QUOTE}: applied`)
    expect(result.stdout).toContain(`(${CREATED})`)
    expect(result.stdout).toContain('Hybrid Link status: completed')
    expect(result.stdout).toContain(
      'Action required: disconnect the Official API in the WhatsApp Business app',
    )
  })

  test('status shows a failed transition reason in JSON and human output', async () => {
    const failed = tierChange(
      {
        action: 'merge',
        absorbNumberId: ABSORBED,
        survivingNumberId: SURVIVOR,
        status: 'failed',
        failureReason: 'hybrid_transition.runtime_unconfirmed',
        metaDisconnectRequired: false,
        effectiveAtMs: null,
      },
      'applied',
    )
    server = await startHttpSequenceServer([{body: {data: failed}}])
    const human = await platform(() =>
      runCommand(`session tier status support ${QUOTE}`),
    )
    expect(human.stdout).toContain(`merge ${ABSORBED} into ${SURVIVOR}`)
    expect(human.stdout).toContain(
      'Hybrid Link status: failed (hybrid_transition.runtime_unconfirmed)',
    )
    const json = await platform(() =>
      runCommand(`session tier status support ${QUOTE} --json`),
    )
    expect(JSON.parse(json.stdout)).toMatchObject({data: failed})
  })

  test('lists merge candidates for an explicit project', async () => {
    const candidates = [
      {
        numbers: [
          {
            id: SURVIVOR,
            name: 'support',
            transport: 'linked_devices',
            status: 'connected',
            canBeAbsorbed: false,
          },
          {
            id: ABSORBED,
            name: 'support-cloud',
            transport: 'official_api',
            status: 'connected',
            canBeAbsorbed: true,
          },
        ],
        eligible: true,
      },
      {
        numbers: [
          {
            id: CREATED,
            name: 'sales',
            transport: 'linked_devices',
            status: 'disconnected',
            canBeAbsorbed: true,
          },
          {
            id: '01994234-0000-7000-8000-00000000000d',
            name: 'sales-cloud',
            transport: 'official_api',
            status: 'connected',
            canBeAbsorbed: true,
          },
        ],
        eligible: false,
        ineligibleReason: 'pairing_in_progress',
      },
    ]
    server = await startHttpSequenceServer([{body: {data: candidates}}])
    const missing = await platform(() =>
      runCommand('session hybrid-merge-candidates'),
    )
    expect(exitCode(missing.error)).toBe(2)
    expect(missing.stderr).toContain('Provide --project')
    expect(server.requests).toHaveLength(0)

    const human = await platform(() =>
      runCommand(`session hybrid-merge-candidates --project ${PROJECT}`),
    )
    expect(human.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/projects/${PROJECT}/hybrid-merge-candidates`,
    ])
    expect(human.stdout).toContain(
      `${SURVIVOR} (support, linked_devices, connected, must be kept)\t${ABSORBED} (support-cloud, official_api, connected, can be absorbed)\teligible\tmerge with: session tier quote ${SURVIVOR} --tier pro --merge-with ${ABSORBED}`,
    )
    expect(human.stdout).toContain(
      'ineligible: pairing_in_progress (a Number is still pairing)',
    )

    const json = await platform(() =>
      runCommand(`session hybrid-merge-candidates --project ${PROJECT} --json`),
    )
    expect(JSON.parse(json.stdout)).toMatchObject({data: candidates})
  })

  test('explains a merge that would absorb a hosted-storage Number', async () => {
    server = await startHttpSequenceServer([
      conflict(
        'hybrid_transition_ineligible',
        'Hybrid Link change unavailable: hms_enabled',
      ),
    ])
    const result = await platform(() =>
      runCommand(
        `session tier quote ${SURVIVOR} --tier pro --merge-with ${ABSORBED}`,
      ),
    )
    expect(exitCode(result.error)).toBe(4)
    expect(result.stderr).toContain(
      'A Number with hosted message storage must be kept: quote the merge on it and pass the other Number to --merge-with.',
    )
  })

  test('candidate listing without Hybrid Link access exits as an authorization failure', async () => {
    server = await startHttpSequenceServer([
      {
        status: 403,
        headers: {'x-request-id': 'req_forbidden'},
        body: {
          error: {
            type: 'permission_error',
            code: 'feature_unavailable',
            message: 'Hybrid Link is not enabled for this team.',
            param: null,
            request_id: 'req_forbidden',
          },
          data: null,
          docs: 'https://docs.polymorfa.com/api/errors#feature_unavailable',
        },
      },
    ])
    const result = await platform(() =>
      runCommand(`session hybrid-merge-candidates --project ${PROJECT} --json`),
    )
    expect(exitCode(result.error)).toBe(3)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {category: 'authorization', code: 'feature_unavailable'},
    })
    expect(server.requests).toHaveLength(1)
  })

  async function platform<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      run,
    )
  }
})

function conflict(code: string, message: string): ResponseFixture {
  return {
    status: 409,
    headers: {'x-request-id': 'req_hybrid'},
    body: {
      error: {
        type: 'conflict_error',
        code,
        message,
        param: null,
        request_id: 'req_hybrid',
      },
      data: null,
      docs: `https://docs.polymorfa.com/api/errors#${code}`,
    },
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
