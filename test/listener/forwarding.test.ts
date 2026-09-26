import {createServer} from 'node:http'
import {createServer as createHttpsServer} from 'node:https'
import {createHmac} from 'node:crypto'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  createForwardingSecret,
  delayForRetry,
  forwardEvent,
  parseForwardHeaders,
  signLocalPayload,
  validateForwardDestination,
} from '../../src/listener/forwarding.js'

const servers: Array<
  ReturnType<typeof createServer> | ReturnType<typeof createHttpsServer>
> = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  )
})

describe('local event forwarding', () => {
  test('validates custom header names and protects signing and framing headers', () => {
    expect(parseForwardHeaders(['X-Mode: local', 'X-Path: a:b'])).toEqual({
      'x-mode': 'local',
      'x-path': 'a:b',
    })
    for (const value of [
      'Authorization: Bearer hidden',
      'Cookie: session=hidden',
      'Content-Length: 0',
      'Polymorfa-Local-Signature: forged',
      'X-Mode: ok\r\nInjected: true',
      'X-Mode: 🚀',
      'invalid',
    ]) {
      expect(() => parseForwardHeaders([value])).toThrow()
    }
    expect(() => parseForwardHeaders(['X-Mode: a', 'x-mode: b'])).toThrow(
      'repeated',
    )
  })

  test('accepts a self-signed loopback HTTPS target only with skipVerify', async () => {
    const [key, cert] = await Promise.all([
      readFile(new URL('../fixtures/listener-tls/key.pem', import.meta.url)),
      readFile(new URL('../fixtures/listener-tls/cert.pem', import.meta.url)),
    ])
    let receivedHeader: string | undefined
    const server = createHttpsServer({key, cert}, (request, response) => {
      receivedHeader = request.headers['x-mode'] as string | undefined
      request.resume()
      response.writeHead(204).end()
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('missing address')
    const input = {
      body: new TextEncoder().encode('{}'),
      eventId: 'evt_1',
      eventType: 'message.received',
      headers: parseForwardHeaders(['X-Mode: local']),
      secret: Buffer.alloc(32, 7).toString('base64url'),
      targets: [`https://127.0.0.1:${address.port}/hook`],
    }
    await expect(forwardEvent(input)).rejects.toThrow('could not be reached')
    await expect(
      forwardEvent({...input, skipVerify: true}),
    ).resolves.toBeUndefined()
    expect(receivedHeader).toBe('local')
  })

  test('does not send custom headers through an origin-changing redirect', async () => {
    let reachedSecond = false
    const second = createServer((_request, response) => {
      reachedSecond = true
      response.writeHead(204).end()
    })
    servers.push(second)
    second.listen(0, '127.0.0.1')
    await once(second, 'listening')
    const secondAddress = second.address()
    if (!secondAddress || typeof secondAddress === 'string')
      throw new Error('missing address')
    const first = createServer((_request, response) => {
      response
        .writeHead(307, {
          Location: `http://127.0.0.1:${secondAddress.port}/hook`,
        })
        .end()
    })
    servers.push(first)
    first.listen(0, '127.0.0.1')
    await once(first, 'listening')
    const firstAddress = first.address()
    if (!firstAddress || typeof firstAddress === 'string')
      throw new Error('missing address')
    await expect(
      forwardEvent({
        body: new TextEncoder().encode('{}'),
        eventId: 'evt_1',
        eventType: 'message.received',
        followRedirects: true,
        headers: parseForwardHeaders(['X-Mode: local']),
        secret: Buffer.alloc(32, 7).toString('base64url'),
        targets: [`http://127.0.0.1:${firstAddress.port}/hook`],
      }),
    ).rejects.toThrow('cross-origin')
    expect(reachedSecond).toBe(false)
  })

  test('forwards exact bytes to loopback with a verifiable local signature', async () => {
    let received:
      | {body: Buffer; headers: Record<string, string | string[] | undefined>}
      | undefined
    const server = createServer((request, response) => {
      void (async () => {
        const parts: Uint8Array[] = []
        for await (const part of request) {
          parts.push(Uint8Array.from(part as Uint8Array))
        }
        received = {
          body: Buffer.concat(parts.map((part) => Buffer.from(part))),
          headers: request.headers,
        }
        response.writeHead(204).end()
      })().catch((error: unknown) => {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        )
      })
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('missing address')
    const body = Uint8Array.from([0, 1, 2, 255])
    const secret = Buffer.alloc(32, 7).toString('base64url')
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)

    await forwardEvent({
      body,
      eventId: 'evt_1',
      eventType: 'message.received',
      secret,
      targets: [`http://127.0.0.1:${address.port}/hook`],
    })

    expect(received?.body).toEqual(Buffer.from(body))
    expect(received?.headers['polymorfa-local-event-id']).toBe('evt_1')
    expect(received?.headers['polymorfa-local-event-type']).toBe(
      'message.received',
    )
    const timestamp = Math.floor(now / 1000)
    const digest = createHmac('sha256', Buffer.from(secret, 'base64url'))
      .update(`${timestamp}.`)
      .update(body)
      .digest('hex')
    expect(received?.headers['polymorfa-local-signature']).toBe(
      `t=${timestamp},v1=${digest}`,
    )
    nowSpy.mockRestore()
  })

  test('requires explicit remote HTTPS and rejects unsafe destination syntax', async () => {
    const publicHost = vi.fn((hostname: string) => {
      expect(hostname).toBe('hooks.example.test')
      return Promise.resolve([{address: '203.0.114.10', family: 4 as const}])
    })
    await expect(
      validateForwardDestination(
        'https://hooks.example.test/hook',
        false,
        publicHost,
      ),
    ).rejects.toThrow('allow-remote-forward')
    await expect(
      validateForwardDestination(
        'http://hooks.example.test/hook',
        true,
        publicHost,
      ),
    ).rejects.toThrow('HTTPS')
    await expect(
      validateForwardDestination(
        'https://hooks.example.test/hook',
        true,
        publicHost,
      ),
    ).resolves.toMatchObject({address: '203.0.114.10', family: 4})
    expect(publicHost).toHaveBeenCalledTimes(3)
    await expect(
      validateForwardDestination('http://user@127.0.0.1/hook', false),
    ).rejects.toThrow('userinfo')
    await expect(
      validateForwardDestination('https://[::ffff:a00:1]/hook', true),
    ).rejects.toThrow('private or reserved')
    await expect(
      validateForwardDestination('http://[::1]/hook', false),
    ).resolves.toMatchObject({address: '::1', family: 6})
  })

  test('creates a 32-byte secret and signs timestamp dot raw body', () => {
    const secret = createForwardingSecret()
    const body = Uint8Array.from([1, 2])
    const expected = createHmac('sha256', Buffer.from(secret, 'base64url'))
      .update('1700000000.')
      .update(body)
      .digest('hex')
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32)
    expect(signLocalPayload(secret, 1_700_000_000, body)).toBe(
      `t=1700000000,v1=${expected}`,
    )
  })

  test('retry delay rejects an already-aborted signal and removes a settled listener', async () => {
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    await expect(delayForRetry(60_000, controller.signal)).rejects.toThrow(
      'stopped',
    )

    const active = new AbortController()
    const remove = vi.spyOn(active.signal, 'removeEventListener')
    await delayForRetry(1, active.signal)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  test('rejects an upstream response that aborts before the body completes', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {'Content-Length': '10'})
      response.write('x')
      response.destroy()
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('missing address')

    await expect(
      forwardEvent({
        body: new TextEncoder().encode('{}'),
        eventId: 'evt_1',
        eventType: 'message.received',
        secret: Buffer.alloc(32, 7).toString('base64url'),
        targets: [`http://127.0.0.1:${address.port}/hook`],
      }),
    ).rejects.toThrow('could not be reached')
  })
})
