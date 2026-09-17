import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {bridgeCallMedia, watchCalls} from '../../src/services/calls.js'
import {
  startCallsServer,
  type CallsServer,
  type FakeSocket,
} from '../helpers/calls-server.js'
import {withEnvironment} from '../helpers/http-server.js'

const API_KEY = 'pmfa_socket_test_key_0123456789'
const CLIENT_TOKEN = 'pmfa_ct_socket_test_token'
const TIMESTAMP = '2026-09-16T10:00:00.000Z'

describe('calls watch and media', () => {
  let server: CallsServer | undefined
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-calls-'))
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    await rm(directory, {force: true, recursive: true})
  })

  test('streams call updates as JSON lines after first-frame authentication', async () => {
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        socket.sendJson({
          participant: 'server:agent-7',
          session: 'support',
          type: 'ready',
        })
        sendEvent(socket, 'call.received', 'call_1', {
          from: {phoneNumber: '+15550100'},
          hasVideo: true,
        })
        sendEvent(socket, 'call.accepted', 'call_1', {
          answeredBy: 'client:web-1',
          exclusive: true,
        })
        sendEvent(socket, 'call.participant_joined', 'call_1', {
          participant: {
            audioMuted: false,
            id: 'participant_1',
            state: 'connected',
            video: false,
          },
        })
        sendEvent(socket, 'call.ended', 'call_1', {reason: 'user_hangup'})
      },
    })

    const result = await apiKey(() =>
      runCommand(
        'calls watch --session support --participant agent-7 --count 4 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => withoutTime(JSON.parse(line) as Record<string, unknown>))
    expect(lines).toEqual([
      {participant: 'server:agent-7', type: 'ready'},
      {callId: 'call_1', peer: '+15550100', type: 'incoming', video: true},
      {
        answered: true,
        answeredBy: 'client:web-1',
        callId: 'call_1',
        canJoin: false,
        claimedByOther: true,
        exclusive: true,
        type: 'claim',
      },
      {
        callId: 'call_1',
        participant: {
          audioMuted: false,
          id: 'participant_1',
          state: 'connected',
          video: false,
        },
        type: 'participant_joined',
      },
      {callId: 'call_1', duration: 0, reason: 'remote_hangup', type: 'ended'},
      {activities: 4, stoppedBy: 'count', type: 'stopped'},
    ])
    const [socket] = server.sockets
    expect(socket?.path).toBe('/voip/ws?session=support&participant=agent-7')
    expect(socket?.path).not.toContain(API_KEY)
    expect(JSON.parse(String(socket?.messages[0]))).toEqual({
      token: API_KEY,
      type: 'auth',
    })
  })

  test('prints readable call updates and status in human mode', async () => {
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        socket.sendJson({participant: 'server:default', type: 'ready'})
        sendEvent(socket, 'call.received', 'call_1', {
          from: '+15550100',
          hasVideo: false,
        })
      },
    })

    const result = await apiKey(() =>
      runCommand('calls watch --session support --count 1'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe(
      'incoming\tcall_1\tfrom=+15550100\tvideo=false\n',
    )
    expect(result.stderr).toContain(
      'Following calls for session support as server:default.',
    )
  })

  test('exits with an authentication error when the socket is refused with 4401', async () => {
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        socket.sendJson({
          code: 'permission_denied',
          message: 'credential not accepted',
          type: 'error',
        })
        socket.close(4401, 'unauthorized')
      },
    })

    const result = await apiKey(() =>
      runCommand('calls watch --session support --json'),
    )

    expect(exitCode(result.error)).toBe(3)
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {category: 'authentication'},
    })
    expect(result.stderr).toContain('permission_denied')
    expect(result.stderr).not.toContain(API_KEY)
    expect(server.sockets).toHaveLength(1)
  })

  test('watches a client token’s bound session without query parameters', async () => {
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        socket.sendJson({
          participant: 'client:web-1',
          session: 'support',
          type: 'ready',
        })
        sendEvent(socket, 'call.received', 'call_2', {from: '+15550100'})
      },
    })

    const result = await clientToken(() =>
      runCommand('calls watch --count 1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.sockets[0]?.path).toBe('/voip/ws')
    expect(JSON.parse(String(server.sockets[0]?.messages[0]))).toEqual({
      token: CLIENT_TOKEN,
      type: 'auth',
    })
  })

  test('validates watch credentials, session, and base URL before connecting', async () => {
    server = await startCallsServer({})

    const participant = await clientToken(() =>
      runCommand('calls watch --participant agent-7 --json'),
    )
    const session = await clientToken(() =>
      runCommand('calls watch --session support --json'),
    )
    const missing = await apiKey(() => runCommand('calls watch --json'))
    const insecure = await withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: 'http://api.example.com',
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand('calls watch --session support --json'),
    )

    expect(exitCode(participant.error)).toBe(2)
    expect(participant.stderr).toContain(
      '--participant requires a server API key',
    )
    expect(exitCode(session.error)).toBe(2)
    expect(session.stderr).toContain('omit --session')
    expect(exitCode(missing.error)).toBe(2)
    expect(missing.stderr).toContain('requires --session')
    expect(exitCode(insecure.error)).toBe(2)
    expect(insecure.stderr).toContain('HTTPS POLYMORFA_BASE_URL')
    expect(server.sockets).toHaveLength(0)
  })

  test('stops watching cleanly when interrupted', async () => {
    const controller = new AbortController()
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        socket.sendJson({participant: 'server:default', type: 'ready'})
      },
    })

    const summary = await watchCalls(
      {
        baseUrl: server.baseUrl,
        credential: {type: 'apiKey', value: API_KEY},
        session: 'support',
        signal: controller.signal,
      },
      {
        activity: () => undefined,
        status: (status) => {
          if (status.type === 'ready') controller.abort()
        },
      },
    )

    expect(summary).toEqual({activities: 0, stoppedBy: 'signal'})
    expect(await server.sockets[0]?.closed).toBeDefined()
  })

  test('reports an unreachable calls service while it keeps retrying', async () => {
    const controller = new AbortController()
    server = await startCallsServer({})
    const baseUrl = server.baseUrl
    await server.close()
    server = undefined
    const statuses: string[] = []

    const summary = await watchCalls(
      {
        baseUrl,
        credential: {type: 'apiKey', value: API_KEY},
        session: 'support',
        signal: controller.signal,
      },
      {
        activity: () => undefined,
        status: (status) => {
          statuses.push(status.type === 'notice' ? status.code : status.type)
          controller.abort()
        },
      },
    )

    expect(statuses).toEqual(['connect_failed'])
    expect(summary).toEqual({activities: 0, stoppedBy: 'signal'})
  })

  test('places a call and bridges raw PCM in both directions', async () => {
    const input = pcm(640)
    const inputPath = join(directory, 'in.pcm')
    const outputPath = join(directory, 'out.pcm')
    await writeFile(inputPath, input)
    const mediaFrames: Buffer[] = []
    let leaveFrame = false
    server = await startCallsServer({
      onSocket: async (socket) => {
        const auth = JSON.parse(String(await socket.next())) as Record<
          string,
          unknown
        >
        if (socket.path.startsWith('/voip/ws')) {
          socket.sendJson({participant: 'server:default', type: 'ready'})
          await delay(100)
          sendEvent(socket, 'call.accepted', 'call_9', {
            answeredBy: 'server:default',
            exclusive: false,
          })
          return
        }
        expect(socket.path).toBe('/voip/calls/call_9/media')
        expect(socket.protocol).toBe('pmfa.calls.v2')
        expect(auth).toMatchObject({token: API_KEY, type: 'auth'})
        expect(String(auth.connectionId)).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
        socket.sendJson({
          callId: 'call_9',
          sampleRate: 16000,
          type: 'ready',
          video: false,
        })
        socket.sendBinary(Uint8Array.from([0x01, 0x01, 0x00, 0x02, 0x00]))
        for (;;) {
          const message = await socket.next()
          if (typeof message !== 'string') {
            mediaFrames.push(message)
            continue
          }
          if ((JSON.parse(message) as {type?: string}).type === 'leave') {
            leaveFrame = true
            return
          }
        }
      },
      rest: () => ({
        body: {
          data: {callId: 'call_9', session: 'support', video: false},
          success: true,
        },
        status: 201,
      }),
    })

    const result = await apiKey(() =>
      runCommand(
        `calls media --session support --place +15550100 --input ${inputPath} --output ${outputPath} --leave-on-eof --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toBe('')
    const statuses = result.stderr
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as {type: string}).type)
    expect(statuses).toEqual([
      'ready',
      'placed',
      'state',
      'state',
      'connected',
      'input_ended',
      'ended',
      'finished',
    ])
    expect(JSON.parse(result.stderr.trim().split('\n').at(-1)!)).toMatchObject({
      bytesReceived: 4,
      bytesSent: 1280,
      callId: 'call_9',
      reason: 'left',
    })
    expect(await readFile(outputPath)).toEqual(Buffer.from([1, 0, 2, 0]))
    expect(
      Buffer.concat(mediaFrames.map((frame) => frame.subarray(1))),
    ).toEqual(input)
    expect(mediaFrames.every((frame) => frame[0] === 0x01)).toBe(true)
    expect(leaveFrame).toBe(true)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/voip/calls',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      exclusive: false,
      session: 'support',
      to: '+15550100',
      video: false,
    })
  })

  test('answers only the requested call and exits on a claim conflict', async () => {
    const outputPath = join(directory, 'out.pcm')
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        socket.sendJson({participant: 'server:agent-7', type: 'ready'})
        sendEvent(socket, 'call.received', 'call_other', {from: '+15550199'})
        sendEvent(socket, 'call.received', 'call_1', {from: '+15550100'})
      },
      rest: () => ({
        body: {
          data: null,
          error: {
            code: 'call_claimed',
            message: 'The request conflicts with the resource state.',
            type: 'conflict_error',
          },
        },
        status: 409,
      }),
    })

    const result = await apiKey(() =>
      runCommand(
        `calls media call_1 --session support --participant agent-7 --exclusive --output ${outputPath} --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(4)
    const lines = result.stderr.trim().split('\n')
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      error: {category: 'conflict', code: 'call_claimed'},
    })
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.url).toBe('/messaging/voip/calls/call_1/accept')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      exclusive: true,
      participant: 'agent-7',
      video: false,
    })
  })

  test('exits with an authorization error when calling is turned off for the session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-calls-off-'))
    const outputPath = join(directory, 'out.pcm')
    try {
      server = await startCallsServer({
        onSocket: async (socket) => {
          await socket.next()
          if (socket.path.startsWith('/voip/ws')) {
            socket.sendJson({participant: 'server:default', type: 'ready'})
            sendEvent(socket, 'call.received', 'call_4', {from: '+15550100'})
            return
          }
          socket.sendJson({code: 'calls_disabled', type: 'error'})
          socket.close(4403, 'calls disabled')
        },
        rest: () => ({
          body: {
            data: {
              answered: true,
              answeredBy: 'server:default',
              exclusive: false,
            },
            success: true,
          },
        }),
      })

      const result = await apiKey(() =>
        runCommand(
          `calls media call_4 --session support --output ${outputPath} --json`,
        ),
      )

      expect(exitCode(result.error)).toBe(3)
      const lines = result.stderr.trim().split('\n')
      expect(JSON.parse(lines.at(-1)!)).toMatchObject({
        error: {
          category: 'authorization',
          code: 'calls_disabled',
          message: 'Calling is turned off for this number.',
        },
      })
      // A refused connection is not retried.
      expect(
        server.sockets.filter((s) => !s.path.startsWith('/voip/ws')),
      ).toHaveLength(1)
    } finally {
      await rm(directory, {force: true, recursive: true})
    }
  })

  test('paces input audio in real time and leaves when interrupted', async () => {
    const controller = new AbortController()
    let received = 0
    server = await startCallsServer({
      onSocket: async (socket) => {
        await socket.next()
        if (socket.path.startsWith('/voip/ws')) {
          socket.sendJson({participant: 'server:default', type: 'ready'})
          sendEvent(socket, 'call.received', 'call_3', {from: '+15550100'})
          return
        }
        socket.sendJson({sampleRate: 16000, type: 'ready', video: false})
        for (;;) {
          const message = await socket.next()
          if (typeof message !== 'string') received += message.byteLength - 1
          else return
        }
      },
      rest: () => ({
        body: {
          data: {
            answered: true,
            answeredBy: 'server:default',
            exclusive: false,
          },
          success: true,
        },
      }),
    })

    const summary = await bridgeCallMedia(
      {
        baseUrl: server.baseUrl,
        credential: {type: 'apiKey', value: API_KEY},
        input: Readable.from([pcm(16_000)]),
        output: () => undefined,
        session: 'support',
        signal: controller.signal,
      },
      (status) => {
        if (status.type === 'connected') {
          setTimeout(() => controller.abort(), 200)
        }
      },
    )

    expect(summary.reason).toBe('left')
    // One second of audio must not be sent in 200 ms.
    expect(summary.bytesSent).toBeGreaterThan(0)
    expect(summary.bytesSent).toBeLessThan(16_000)
    await delay(50)
    expect(received).toBe(summary.bytesSent)
  })

  test('refuses a dependent flag without input before connecting', async () => {
    server = await startCallsServer({})

    const result = await apiKey(() =>
      runCommand(
        `calls media --session support --leave-on-eof --output ${join(directory, 'out.pcm')}`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(server.sockets).toHaveLength(0)
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

function sendEvent(
  socket: FakeSocket,
  event: string,
  callId: string,
  payload: Record<string, unknown>,
): void {
  socket.sendJson({
    callId,
    event,
    payload: {callId, ...payload},
    timestamp: TIMESTAMP,
    type: 'event',
  })
}

function pcm(samples: number): Buffer {
  const bytes = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) {
    bytes.writeInt16LE(index % 32_000, index * 2)
  }
  return bytes
}

function withoutTime(value: Record<string, unknown>): Record<string, unknown> {
  const {at, ...rest} = value
  if (at !== undefined) expect(typeof at).toBe('string')
  return rest
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
