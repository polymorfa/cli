import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {writeListenLine} from '../../src/commands/listen.js'
import {writeCheckpoint} from '../../src/listener/checkpoint.js'
import {withEnvironment} from '../helpers/http-server.js'
import {temporaryDirectory} from '../support/fs.js'
import {join} from 'node:path'

describe('listen', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  test('emits JSONL and acknowledges only after the event line', async () => {
    const requests: string[] = []
    const server = createServer(
      (request, response) => void route(request, response, requests),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('missing server address')
    const baseUrl = `http://127.0.0.1:${address.port}`
    close = () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    activeBaseUrl = baseUrl

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN:
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      () => runCommand(`listen --project ${PROJECT} --event message.* --json`),
    )

    expect(exitCode(result.error)).toBe(3)
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as {type: string})
    expect(lines.map(({type}) => type)).toEqual([
      'ready',
      'event',
      'revoked',
      'terminal',
    ])
    expect(lines[0]).toMatchObject({
      acceptedCursor: null,
      filters: {events: ['message.*']},
      startPosition: 'now',
      type: 'ready',
    })
    expect(lines[0]).not.toHaveProperty('resume')
    expect(requests).toEqual(['authorize', 'stream', 'ack'])
  })

  test('waits for the stdout write callback before completing a sink', async () => {
    let callback: ((error?: Error | null) => void) | undefined
    const writer = {
      write(
        _value: string,
        _encoding: BufferEncoding,
        done: (error?: Error | null) => void,
      ) {
        callback = done
        return true
      },
    }
    let settled = false
    const writing = writeListenLine(
      {
        listenerId: AUTH,
        observedAt: '2026-09-08T00:00:00Z',
        schemaVersion: 1,
        sequence: 1,
        streamId: STREAM,
        type: 'ready',
      },
      true,
      false,
      writer,
    ).then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    callback?.()
    await writing
    expect(settled).toBe(true)
  })

  test('emits a synthetic gap before failing an expired checkpoint', async () => {
    const path = join(await temporaryDirectory(), 'listen.json')
    await writeCheckpoint(path, {
      cursorExpiresAt: '2026-09-07T00:00:00Z',
      filters: {events: ['message.*']},
      kind: 'polymorfa_cli_listener_checkpoint',
      lastAcknowledgedCursor: 'expired-cursor',
      projectId: PROJECT,
      protocolVersion: '1',
      schemaVersion: 1,
      updatedAt: '2026-09-07T00:00:00Z',
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN:
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      () =>
        runCommand(
          `listen --project ${PROJECT} --event message.* --checkpoint-file ${path} --json`,
        ),
    )

    expect(exitCode(result.error)).toBe(9)
    expect(JSON.parse(result.stdout)).toMatchObject({
      reason: 'checkpoint_expired',
      sequence: 0,
      streamId: null,
      type: 'gap',
    })
  })

  test.each([
    '--allow-remote-forward',
    '--follow-redirects',
    '--forward-secret-out /tmp/unused-listener-secret',
    '-H X-Mode:local',
    '--skip-verify',
  ])('requires --forward-to when using %s', async (flag) => {
    const result = await runCommand(`listen --project ${PROJECT} ${flag}`)

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('--forward-to')
  })

  test('rejects a reserved custom header without echoing its value', async () => {
    const result = await runCommand(
      `listen --project ${PROJECT} --forward-to http://127.0.0.1:1 -H 'Authorization: hidden-value'`,
    )
    expect(result.error).toBeDefined()
    expect(result.stderr).not.toContain('hidden-value')
  })

  test('rejects skip-verify for a public forwarding destination', async () => {
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN:
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      () =>
        runCommand(
          `listen --project ${PROJECT} --forward-to https://1.1.1.1/hook --allow-remote-forward --skip-verify`,
        ),
    )
    expect(result.error).toBeDefined()
    expect(result.stderr).toContain('loopback')
  })

  test('reports an actionable machine error when forwarding has no secret destination', async () => {
    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN:
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      () =>
        runCommand(
          `listen --project ${PROJECT} --forward-to http://127.0.0.1:1 --json`,
        ),
    )

    expect(exitCode(result.error)).toBe(8)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {code: 'action_required'},
      schemaVersion: 1,
    })
  })
})

const PROJECT = '11111111-1111-4111-8111-111111111111'
const STREAM = '22222222-2222-4222-8222-222222222222'
const AUTH = '33333333-3333-4333-8333-333333333333'
const EVENT = '44444444-4444-4444-8444-444444444444'
const ORGANIZATION = '55555555-5555-4555-8555-555555555555'
let activeBaseUrl = ''

function route(
  request: IncomingMessage,
  response: ServerResponse,
  requests: string[],
) {
  request.resume()
  if (request.url === '/v1/cli/listener-authorizations') {
    requests.push('authorize')
    response.writeHead(201, {'content-type': 'application/json'})
    response.end(JSON.stringify({data: authorization()}))
    return
  }
  if (request.url?.endsWith('/events')) {
    requests.push('stream')
    response.writeHead(200, {'content-type': 'text/event-stream'})
    response.end(
      [
        sse('ready', ready()),
        sse('event', event(), 'cursor_1'),
        sse('revoked', {
          ...base('revoked', 3),
          lastCursor: 'cursor_1',
          reason: 'principal_revoked',
        }),
      ].join(''),
    )
    return
  }
  if (request.url?.endsWith('/ack')) {
    requests.push('ack')
    response.writeHead(200, {'content-type': 'application/json'})
    response.end(
      JSON.stringify({
        data: {
          acknowledgedCursor: 'cursor_1',
          replayed: false,
          sequence: 2,
          streamId: STREAM,
        },
      }),
    )
    return
  }
  response.writeHead(404).end()
}

function authorization() {
  return {
    ackUrl: `${activeBaseUrl}/v1/cli/listener-streams/${STREAM}/ack`,
    authorizationId: AUTH,
    capabilities: {resume: true},
    closeUrl: `${activeBaseUrl}/v1/cli/listener-streams/${STREAM}/close`,
    credentialExpiresAt: '2030-01-01T00:00:00Z',
    filters: {events: ['message.*']},
    limits: {
      ackTimeoutMs: 30_000,
      heartbeatIntervalMs: 15_000,
      maxEventBytes: 65_536,
      maxInFlight: 32,
    },
    listenerCredential: `pmfa_ls_${'a'.repeat(43)}`,
    mediaType: 'text/event-stream',
    projectId: PROJECT,
    protocolVersion: '1',
    resume: {
      acceptedCursor: null,
      cursorExpiresAt: '2030-01-01T00:00:00Z',
      oldestAvailableCursor: null,
      startPosition: 'now',
    },
    streamId: STREAM,
    streamUrl: `${activeBaseUrl}/v1/cli/listener-streams/${STREAM}/events`,
  }
}

function base(type: string, sequence: number) {
  return {
    sentAt: '2026-09-08T00:00:00Z',
    sequence,
    streamId: STREAM,
    type,
    v: 1,
  }
}
function ready() {
  return {
    ...base('ready', 1),
    connectionExpiresAt: '2030-01-01T00:00:00Z',
    heartbeatIntervalMs: 15_000,
    maxInFlight: 32,
    projectId: PROJECT,
    resume: {
      acceptedCursor: null,
      cursorExpiresAt: '2030-01-01T00:00:00Z',
      oldestAvailableCursor: null,
      startPosition: 'now',
    },
  }
}
function event() {
  return {
    ...base('event', 2),
    body: {
      contentType: 'application/json',
      data: 'eyJvayI6dHJ1ZX0=',
      encoding: 'base64',
    },
    cursor: 'cursor_1',
    event: {
      createdAt: '2026-09-08T00:00:00Z',
      environment: 'development',
      id: EVENT,
      metadataExpiresAt: '2026-10-08T00:00:00Z',
      organizationId: ORGANIZATION,
      payloadAvailability: 'available',
      projectId: PROJECT,
      replayableUntil: null,
      source: 'runtime',
      type: 'message.received',
    },
  }
}
function sse(type: string, data: unknown, id?: string) {
  return `event: ${type}\n${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(data)}\n\n`
}

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error))
    return undefined
  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
