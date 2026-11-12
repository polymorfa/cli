import {runCommand} from '@oclif/test'
import {Readable} from 'node:stream'
import {afterEach, describe, expect, test} from 'vitest'

import {parseCallLink} from '../../src/services/call-links.js'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'
const CLIENT_TOKEN =
  'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO'
const TOKEN = 'AbCdEf0123456789_link-token'

describe('call link commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('creates a voice link without an idempotency key', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: {
          session: 'support',
          token: TOKEN,
          url: `https://call.whatsapp.com/voice/${TOKEN}`,
          video: false,
        },
      },
      headers: {'request-id': 'req_link'},
      status: 201,
    })

    const result = await apiKey(() =>
      runCommand('calls link create --session support'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      `Link\thttps://call.whatsapp.com/voice/${TOKEN}`,
    )
    expect(result.stdout).toContain('Keep it private')
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/voip/call-links',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      session: 'support',
      video: false,
    })
  })

  test('creates a video link as JSON', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: {
          session: 'support',
          token: TOKEN,
          url: `https://call.whatsapp.com/video/${TOKEN}`,
          video: true,
        },
      },
      status: 201,
    })

    const result = await apiKey(() =>
      runCommand('calls link create --session support --video --json'),
    )

    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual({
      session: 'support',
      token: TOKEN,
      url: `https://call.whatsapp.com/video/${TOKEN}`,
      video: true,
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      session: 'support',
      video: true,
    })
  })

  test('previews a full link read from standard input', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: {
          session: 'support',
          video: true,
          creator: {id: '1637209842659371410', phoneNumber: '+15550100'},
          approvalRequired: true,
          isAdmin: false,
        },
      },
    })

    const result = await withStdin(
      `https://call.whatsapp.com/video/${TOKEN}\n`,
      () => apiKey(() => runCommand('calls link preview --session support')),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('Creator\t+15550100')
    expect(result.stdout).toContain('Approval required\tyes')
    expect(result.stdout).not.toContain(TOKEN)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/voip/call-links/preview',
    })
    expect(server.requests[0]?.url).not.toContain(TOKEN)
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      session: 'support',
      token: TOKEN,
      video: true,
    })
  })

  test('previews a bare token with --video', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: {
          session: 'support',
          video: true,
          creator: {id: '1637209842659371410'},
          approvalRequired: false,
          isAdmin: true,
        },
      },
    })

    const result = await withStdin(TOKEN, () =>
      apiKey(() =>
        runCommand('calls link preview --session support --video --json'),
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      session: 'support',
      token: TOKEN,
      video: true,
    })
  })

  test('refuses a voice link with --video before any request', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await withStdin(
      `https://call.whatsapp.com/voice/${TOKEN}`,
      () =>
        apiKey(() =>
          runCommand('calls link preview --session support --video'),
        ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('voice link')
    expect(server.requests).toHaveLength(0)
  })

  test('refuses malformed input without echoing it', async () => {
    server = await startHttpServer({body: {success: true}})
    const input = 'https://example.com/not-a-call-link?secret=abc'

    const result = await withStdin(input, () =>
      apiKey(() => runCommand('calls link preview --session support')),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('call.whatsapp.com')
    expect(result.stderr).not.toContain('secret=abc')
    expect(server.requests).toHaveLength(0)
  })

  test('refuses client tokens before reading the link', async () => {
    server = await startHttpServer({body: {success: true}})

    const create = await clientToken(() =>
      runCommand('calls link create --session support'),
    )
    const preview = await withStdin(TOKEN, () =>
      clientToken(() => runCommand('calls link preview --session support')),
    )

    expect(exitCode(create.error)).toBe(2)
    expect(create.stderr).toContain('Call link commands require')
    expect(exitCode(preview.error)).toBe(2)
    expect(preview.stderr).toContain('Call link commands require')
    expect(server.requests).toHaveLength(0)
  })

  test('parses pasted links and refuses ambiguous input', () => {
    expect(
      parseCallLink(
        `Join my call: HTTPS://Call.WhatsApp.com/Video/${TOKEN}?lang=en#x.`,
      ),
    ).toEqual({token: TOKEN, video: true})
    expect(parseCallLink(`https://call.whatsapp.com/voice/${TOKEN}/`)).toEqual({
      token: TOKEN,
      video: false,
    })
    expect(parseCallLink(` ${TOKEN}\n`)).toEqual({token: TOKEN})
    // The same link twice is one link.
    const link = `https://call.whatsapp.com/voice/${TOKEN}`
    expect(parseCallLink(`${link} ${link}`)).toEqual({
      token: TOKEN,
      video: false,
    })
    expect(() =>
      parseCallLink(`${link} https://call.whatsapp.com/video/${TOKEN}`),
    ).toThrow('more than one call link')
    for (const input of [
      'video',
      `http://call.whatsapp.com/voice/${TOKEN}`,
      'https://call.whatsapp.com/voice/short',
      `https://call.whatsapp.com/voice/${TOKEN}extra$`,
    ])
      expect(() => parseCallLink(input)).toThrow('Standard input must contain')
  })

  test('refuses an interactive terminal and empty input with link messages', async () => {
    server = await startHttpServer({body: {success: true}})
    const terminal = Object.assign(Readable.from([]), {isTTY: true})
    const interactive = await withStdinStream(terminal, () =>
      apiKey(() => runCommand('calls link preview --session support')),
    )
    const empty = await withStdin('', () =>
      apiKey(() => runCommand('calls link preview --session support')),
    )

    expect(exitCode(interactive.error)).toBe(2)
    expect(interactive.stderr).toContain('Pipe the call link')
    expect(exitCode(empty.error)).toBe(2)
    expect(empty.stderr).toContain('one call link or token')
    expect(empty.stderr).not.toContain('credential')
    expect(server.requests).toHaveLength(0)
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

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}

async function withStdin<T>(value: string, run: () => Promise<T>): Promise<T> {
  return withStdinStream(Readable.from(value.length === 0 ? [] : [value]), run)
}

async function withStdinStream<T>(
  stream: Readable,
  run: () => Promise<T>,
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stream,
  })
  try {
    return await run()
  } finally {
    if (descriptor !== undefined)
      Object.defineProperty(process, 'stdin', descriptor)
  }
}
