import {runCommand} from '@oclif/test'
import {spawn} from 'node:child_process'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PROJECT = '018f0000-0000-7000-8000-000000000002'
const TRUNK_ID = '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10'

const trunk = {
  id: TRUNK_ID,
  projectId: PROJECT,
  name: 'Head office PBX',
  enabled: true,
  direction: 'both',
  outbound: {
    targetUri: 'sips:pbx.example.com',
    transport: 'tls',
    authUsername: 'polymorfa',
    hasPassword: true,
    fromUser: null,
  },
  inbound: {
    username: 'pmfa_abc',
    realm: 'sip.example.test',
    session: null,
    allowedAddresses: ['203.0.113.10/32'],
    allowedDestinations: [],
  },
  codecs: ['PCMA', 'PCMU'],
  maxConcurrentCalls: 30,
  revision: 3,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
}

const hostedEndpoint = {
  status: 'hosted',
  host: 'sip.example.test',
  transports: [
    {transport: 'udp', port: 5060, srtp: 'not_supported'},
    {transport: 'tcp', port: 5060, srtp: 'not_supported'},
    {transport: 'tls', port: 5061, srtp: 'required'},
  ],
  rtp: {protocol: 'udp', portMin: 20000, portMax: 20999},
}

const notHostedEndpoint = {
  status: 'sip_not_hosted',
  host: null,
  transports: [],
  rtp: null,
}

describe('sip-trunk commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('lists and shows trunks for a project', async () => {
    server = await startHttpSequenceServer([
      {body: {data: [trunk], success: true}},
      {body: {data: trunk, success: true}},
    ])

    const listed = await apiKey(() =>
      runCommand(`sip-trunk list --project ${PROJECT}`),
    )
    const viewed = await apiKey(() => runCommand(`sip-trunk view ${TRUNK_ID}`))
    const missing = await apiKey(() => runCommand('sip-trunk list'))

    expect(listed.error).toBeUndefined()
    expect(listed.stdout).toBe(
      `${TRUNK_ID}\tHead office PBX\tboth\tenabled\tsips:pbx.example.com\n`,
    )
    expect(viewed.stdout).toContain('Password stored\tyes')
    expect(viewed.stdout).toContain('From user\tcaller identity (automatic)')
    expect(viewed.stdout).toContain('Calling session\tnot set (calls refused)')
    expect(viewed.stdout).toContain('Allowed destinations\tany')
    expect(viewed.stdout).toContain('Revision\t3')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/sip-trunks?projectId=${PROJECT}`,
      `GET /platform/sip-trunks/${TRUNK_ID}`,
    ])
    expect(exitCode(missing.error)).toBe(2)
  })

  test('creates a trunk from a file and prints the one-time password', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            inboundCredentials: {
              password: 'one-time-secret',
              realm: 'sip.example.test',
              username: 'pmfa_abc',
            },
            trunk,
          },
          success: true,
        },
        status: 201,
      },
      {body: {data: hostedEndpoint, success: true}},
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-sip-'))
    const input = join(directory, 'trunk.json')
    const body = {
      direction: 'both',
      inbound: {allowedAddresses: ['203.0.113.10']},
      name: 'Head office PBX',
      outbound: {
        authPassword: 'pbx-secret',
        authUsername: 'polymorfa',
        targetUri: 'sips:pbx.example.com',
        transport: 'tls',
      },
    }
    await writeFile(input, JSON.stringify(body))

    const created = await apiKey(() =>
      runCommand(`sip-trunk create --project ${PROJECT} --input ${input}`),
    )
    const withProject = join(directory, 'with-project.json')
    await writeFile(withProject, JSON.stringify({...body, projectId: PROJECT}))
    const refused = await apiKey(() =>
      runCommand(
        `sip-trunk create --project ${PROJECT} --input ${withProject}`,
      ),
    )

    expect(created.error).toBeUndefined()
    expect(created.stdout).toContain('Password\tone-time-secret')
    expect(created.stdout).toContain('cannot be shown again')
    expect(created.stdout).toContain(
      'SIP address\nHost\tsip.example.test\nTransport\tUDP 5060, SRTP not supported',
    )
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      ...body,
      projectId: PROJECT,
    })
    expect(exitCode(refused.error)).toBe(2)
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /platform/sip-trunks',
      'GET /platform/sip/endpoint',
    ])
  })

  test('shows the SIP address of the environment', async () => {
    server = await startHttpSequenceServer([
      {body: {data: hostedEndpoint, success: true}},
      {body: {data: hostedEndpoint, success: true}},
      {body: {data: notHostedEndpoint, success: true}},
    ])

    const hosted = await apiKey(() => runCommand('sip-trunk endpoint'))
    const json = await apiKey(() => runCommand('sip-trunk endpoint --json'))
    const notHosted = await apiKey(() => runCommand('sip-trunk endpoint'))

    expect(hosted.error).toBeUndefined()
    expect(hosted.stdout).toBe(
      [
        'Host\tsip.example.test',
        'Transport\tUDP 5060, SRTP not supported',
        'Transport\tTCP 5060, SRTP not supported',
        'Transport\tTLS 5061, SRTP required',
        'RTP\tUDP 20000-20999',
        'Allow SIP and RTP in both directions between your PBX and the addresses sip.example.test resolves to.',
        '',
      ].join('\n'),
    )
    expect(json.error).toBeUndefined()
    expect((JSON.parse(json.stdout) as {data: unknown}).data).toEqual(
      hostedEndpoint,
    )
    expect(notHosted.error).toBeUndefined()
    expect(notHosted.stdout).toBe('This environment has no SIP address.\n')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /platform/sip/endpoint',
      'GET /platform/sip/endpoint',
      'GET /platform/sip/endpoint',
    ])
  })

  test('reports sip_not_hosted as data in JSON output', async () => {
    server = await startHttpServer({
      body: {data: notHostedEndpoint, success: true},
    })

    const json = await apiKey(() => runCommand('sip-trunk endpoint --json'))

    expect(json.error).toBeUndefined()
    expect((JSON.parse(json.stdout) as {data: unknown}).data).toEqual(
      notHostedEndpoint,
    )
  })

  test('fails on an API error or an invalid SIP address response', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          error: {
            code: 'permission_denied',
            message: 'The credential does not have access to this resource.',
            type: 'permission_error',
          },
          success: false,
        },
        status: 403,
      },
      {
        body: {
          data: {...notHostedEndpoint, host: 'made-up.example.test'},
          success: true,
        },
      },
    ])

    const denied = await apiKey(() => runCommand('sip-trunk endpoint'))
    const invalid = await apiKey(() => runCommand('sip-trunk endpoint'))

    expect(exitCode(denied.error)).toBe(3)
    expect(denied.stderr).toContain('does not have access')
    expect(denied.stdout).toBe('')
    expect(invalid.error).toBeDefined()
    expect(invalid.stdout).not.toContain('made-up.example.test')
  })

  test('refuses a hosted address without transports or an RTP range', async () => {
    server = await startHttpSequenceServer([
      {
        body: {data: {...hostedEndpoint, rtp: null}, success: true},
        status: 200,
      },
      {
        body: {data: {...hostedEndpoint, transports: []}, success: true},
        status: 200,
      },
    ])

    const withoutRtp = await apiKey(() => runCommand('sip-trunk endpoint'))
    const withoutTransports = await apiKey(() =>
      runCommand('sip-trunk endpoint'),
    )

    expect(withoutRtp.error).toBeDefined()
    expect(withoutRtp.stdout).not.toContain('sip.example.test')
    expect(withoutTransports.error).toBeDefined()
    expect(withoutTransports.stdout).not.toContain('sip.example.test')
  })

  test.each([
    ['rotate-credentials', 'rotated-first', undefined],
    ['create', 'created-first', undefined],
    ['rotate-credentials', 'rotated-fast', 500],
    ['create', 'created-fast', 500],
  ] as const)(
    '%s prints %s before a hanging address lookup, respecting timeout %s',
    async (command, password, timeoutMs) => {
      const credentials = {
        password,
        realm: 'sip.example.test',
        username: 'pmfa_abc',
      }
      let endpointRequests = 0
      let endpointStartedAt = 0
      // Answers the trunk request, then never answers the address lookup.
      const hanging = createServer((request, reply) => {
        if (request.url?.startsWith('/platform/sip/endpoint')) {
          endpointRequests += 1
          endpointStartedAt ||= performance.now()
          return
        }
        reply.writeHead(command === 'create' ? 201 : 200, {
          'content-type': 'application/json',
        })
        reply.end(
          JSON.stringify({
            data:
              command === 'create'
                ? {trunk, inboundCredentials: credentials}
                : credentials,
            success: true,
          }),
        )
      })
      await new Promise<void>((resolve) =>
        hanging.listen(0, '127.0.0.1', resolve),
      )
      const {port} = hanging.address() as AddressInfo
      const directory = await mkdtemp(join(tmpdir(), 'polymorfa-sip-order-'))
      const input = join(directory, 'trunk.json')
      await writeFile(input, JSON.stringify({name: 'PBX', direction: 'both'}))
      const args =
        command === 'create'
          ? ['sip-trunk', 'create', '--project', PROJECT, '--input', input]
          : ['sip-trunk', 'rotate-credentials', TRUNK_ID, '--yes']
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          fileURLToPath(new URL('../../bin/dev.js', import.meta.url)),
          ...args,
          ...(timeoutMs === undefined ? [] : ['--timeout', String(timeoutMs)]),
        ],
        {
          env: {
            ...process.env,
            POLYMORFA_API_KEY: API_KEY,
            POLYMORFA_BASE_URL: `http://127.0.0.1:${port}`,
            POLYMORFA_CLIENT_TOKEN: '',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      const exited = new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolve({code, signal}))
      })
      let stdout = ''
      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += String(chunk)
      })
      let timer: NodeJS.Timeout | undefined
      let exitTimer: NodeJS.Timeout | undefined
      try {
        const printed = new Promise<boolean>((resolve) => {
          child.stdout.on('data', (chunk: Buffer) => {
            stdout += String(chunk)
            if (stdout.includes(password)) resolve(true)
          })
          timer = setTimeout(() => resolve(false), 20_000)
        })

        // The password is on screen before the lookup ends, so interrupting
        // the command now cannot lose it.
        expect(await printed, stderr).toBe(true)
        expect(child.exitCode).toBeNull()
        expect(stdout).not.toContain('SIP address')
        const outcome = await Promise.race([
          exited,
          new Promise<never>((_, reject) => {
            exitTimer = setTimeout(
              () =>
                reject(
                  new Error(
                    'Optional address lookup did not finish within eight seconds',
                  ),
                ),
              8_000,
            )
          }),
        ])
        expect(outcome, stderr).toEqual({code: 0, signal: null})
        expect(endpointRequests).toBe(1)
        const lookupMs = performance.now() - endpointStartedAt
        expect(lookupMs).toBeGreaterThanOrEqual(
          timeoutMs === undefined ? 4_000 : 100,
        )
        expect(lookupMs).toBeLessThan(timeoutMs === undefined ? 8_000 : 2_000)
        expect(stdout).toContain(password)
        expect(stdout).not.toContain('SIP address')
      } finally {
        clearTimeout(timer)
        clearTimeout(exitTimer)
        if (child.exitCode === null && child.signalCode === null) child.kill()
        await exited
        hanging.closeAllConnections()
        await new Promise<void>((resolve) => hanging.close(() => resolve()))
        await rm(directory, {force: true, recursive: true})
      }
    },
    30_000,
  )

  test('still prints rotated credentials when the SIP address is unavailable', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            password: 'rotated',
            realm: 'sip.example.test',
            username: 'pmfa_abc',
          },
          success: true,
        },
      },
      {
        body: {
          error: {code: 'permission_denied', message: 'Denied.'},
          success: false,
        },
        status: 403,
      },
      {
        body: {
          data: {
            password: 'rotated-again',
            realm: 'sip.example.test',
            username: 'pmfa_abc',
          },
          success: true,
        },
      },
      {body: {data: notHostedEndpoint, success: true}},
    ])

    const failed = await apiKey(() =>
      runCommand(`sip-trunk rotate-credentials ${TRUNK_ID} --yes`),
    )
    const notHosted = await apiKey(() =>
      runCommand(`sip-trunk rotate-credentials ${TRUNK_ID} --yes`),
    )

    expect(failed.error).toBeUndefined()
    expect(failed.stdout).toContain('Password\trotated\n')
    expect(failed.stdout).not.toContain('SIP address')
    expect(notHosted.error).toBeUndefined()
    expect(notHosted.stdout).toContain('Password\trotated-again')
    expect(notHosted.stdout).toContain(
      'SIP address\nThis environment has no SIP address.',
    )
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `POST /platform/sip-trunks/${TRUNK_ID}/credentials`,
      'GET /platform/sip/endpoint',
      `POST /platform/sip-trunks/${TRUNK_ID}/credentials`,
      'GET /platform/sip/endpoint',
    ])
  })

  test('disables a trunk with a revision guard and reports conflicts', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {...trunk, enabled: false, revision: 4}, success: true}},
      {
        body: {
          error: {
            code: 'sip_trunk_revision_conflict',
            message: 'The trunk changed.',
          },
          success: false,
        },
        status: 409,
      },
    ])

    const disabled = await apiKey(() =>
      runCommand(
        `sip-trunk update ${TRUNK_ID} --disable --expected-revision 3`,
      ),
    )
    const stale = await apiKey(() =>
      runCommand(`sip-trunk update ${TRUNK_ID} --enable --expected-revision 3`),
    )
    const nothing = await apiKey(() =>
      runCommand(`sip-trunk update ${TRUNK_ID} --expected-revision 3`),
    )
    const badId = await apiKey(() =>
      runCommand('sip-trunk update nope --enable'),
    )

    expect(disabled.error).toBeUndefined()
    expect(disabled.stdout).toContain('Enabled\tno')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      enabled: false,
      expectedRevision: 3,
    })
    expect(server.requests[0]?.method).toBe('PATCH')
    expect(exitCode(stale.error)).toBe(4)
    expect(stale.stderr).toContain('The trunk changed.')
    expect(exitCode(nothing.error)).toBe(2)
    expect(exitCode(badId.error)).toBe(2)
    expect(server.requests).toHaveLength(2)
  })

  test('requires confirmation to delete or rotate', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {deleted: true, id: TRUNK_ID}, success: true}},
      {
        body: {
          data: {
            password: 'rotated',
            realm: 'sip.example.test',
            username: 'pmfa_abc',
          },
          success: true,
        },
      },
    ])

    const unconfirmed = await apiKey(() =>
      runCommand(`sip-trunk delete ${TRUNK_ID}`),
    )
    const deleted = await apiKey(() =>
      runCommand(`sip-trunk delete ${TRUNK_ID} --yes`),
    )
    const rotated = await apiKey(() =>
      runCommand(`sip-trunk rotate-credentials ${TRUNK_ID} --yes --json`),
    )

    expect(exitCode(unconfirmed.error)).toBe(2)
    expect(deleted.stdout).toBe(`Deleted SIP trunk ${TRUNK_ID}.\n`)
    expect(
      (JSON.parse(rotated.stdout) as {data: {password: string}}).data.password,
    ).toBe('rotated')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `DELETE /platform/sip-trunks/${TRUNK_ID}`,
      `POST /platform/sip-trunks/${TRUNK_ID}/credentials`,
    ])
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
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
