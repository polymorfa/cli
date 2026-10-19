import {createCipheriv, createHash, createHmac, hkdfSync} from 'node:crypto'
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('media commands', () => {
  let directory: string
  let server: TestHttpServer | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-media-'))
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    await rm(directory, {force: true, recursive: true})
  })

  test('views Messaging media metadata through an encoded identifier', async () => {
    server = await startHttpServer({
      body: {data: mediaInfo(), success: true},
      headers: {'request-id': 'req_media_info'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('media view media/1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: mediaInfo(),
      metadata: {attempts: 1, requestId: 'req_media_info', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/messaging/media/media%2F1/info')
  })

  test('rejects a client token before a Messaging media request', async () => {
    server = await startHttpServer({body: {data: mediaInfo(), success: true}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO',
      },
      () => runCommand('media view media_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Media commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('downloads bounded binary media to an explicit path', async () => {
    const output = join(directory, 'photo.png')
    server = await startHttpSequenceServer([
      {body: {data: mediaInfo(), success: true}},
      {
        headers: {
          'content-disposition': 'attachment; filename="photo.png"',
          'content-length': '4',
          'content-type': 'image/png',
          'request-id': 'req_media_download',
        },
        rawBody: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(`media download media/1 --output ${output} --json`),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {
        bytes: 4,
        mediaId: 'media/1',
        mimeType: 'image/png',
        path: output,
      },
      metadata: {
        attempts: 1,
        requestId: 'req_media_download',
        status: 200,
      },
    })
    await expect(readFile(output)).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    )
    expect(server.requests.map(({url}) => url)).toEqual([
      '/messaging/media/media%2F1/info',
      '/messaging/media/media%2F1',
    ])
  })

  test('rejects media larger than the configured buffer limit before download', async () => {
    const output = join(directory, 'too-large.bin')
    server = await startHttpServer({
      body: {
        data: {...mediaInfo(), fileLength: 5},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `media download media_1 --output ${output} --max-bytes 4 --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('exceeds the 4 byte download limit')
    expect(server.requests).toHaveLength(1)
    await expect(readFile(output)).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('does not write when downloaded bytes exceed the declared size limit', async () => {
    const output = join(directory, 'unexpectedly-large.bin')
    server = await startHttpSequenceServer([
      {body: {data: mediaInfo(), success: true}},
      {rawBody: new Uint8Array([1, 2, 3, 4, 5])},
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `media download media_1 --output ${output} --max-bytes 4 --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('exceeds the 4 byte download limit')
    await expect(readFile(output)).rejects.toMatchObject({code: 'ENOENT'})
    await expect(readdir(directory)).resolves.toEqual([])
  })

  test('refuses to overwrite a local file unless force is explicit', async () => {
    const output = join(directory, 'existing.bin')
    await writeFile(output, 'existing')
    server = await startHttpServer({body: {data: mediaInfo(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(`media download media_1 --output ${output} --json`),
    )

    expect(exitCode(result.error)).toBe(4)
    expect(result.stderr).toContain('already exists')
    expect(server.requests).toHaveLength(0)
    await expect(readFile(output, 'utf8')).resolves.toBe('existing')
  })

  test('overwrites a local file only when force is explicit', async () => {
    const output = join(directory, 'existing.bin')
    await writeFile(output, 'existing')
    server = await startHttpSequenceServer([
      {body: {data: mediaInfo(), success: true}},
      {rawBody: new Uint8Array([1, 2, 3, 4])},
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(`media download media_1 --output ${output} --force --json`),
    )

    expect(result.error).toBeUndefined()
    await expect(readFile(output)).resolves.toEqual(Buffer.from([1, 2, 3, 4]))
    expect(server.requests).toHaveLength(2)
  })

  test('persists media server-side with an idempotency key', async () => {
    server = await startHttpServer({
      body: {success: true},
      headers: {'request-id': 'req_media_persist'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('media persist media/1 --idempotency-key persist_1 --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: {success: true},
      metadata: {
        attempts: 1,
        requestId: 'req_media_persist',
        status: 200,
      },
    })
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'POST',
      url: '/messaging/media/media%2F1/download-and-save',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('persist_1')
  })

  test('rejects a declared Content-Length above the limit before writing', async () => {
    const output = join(directory, 'declared.bin')
    server = await startHttpSequenceServer([
      {body: {data: mediaInfo(), success: true}},
      {
        headers: {'content-length': '5'},
        rawBody: new Uint8Array([1, 2, 3, 4, 5]),
      },
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(`media download media_1 -o ${output} --max-bytes 4 --json`),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('is 5 bytes')
    await expect(readdir(directory)).resolves.toEqual([])
  })

  test('follows a storage redirect without forwarding the API key', async () => {
    const output = join(directory, 'redirected.bin')
    server = await startHttpSequenceServer([
      {body: {data: mediaInfo(), success: true}},
      {
        headers: {
          location: '/storage/object?sig=abc',
          'request-id': 'req_redirect',
        },
        rawBody: '',
        status: 302,
      },
      {rawBody: new Uint8Array([7, 7, 7, 7])},
    ])

    const result = await apiKeyEnvironment(() =>
      runCommand(`media download media_1 --output ${output} --json`),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {bytes: 4, path: output},
      metadata: {requestId: 'req_redirect', status: 302},
    })
    await expect(readFile(output)).resolves.toEqual(Buffer.from([7, 7, 7, 7]))
    expect(server.requests[1]?.headers.authorization).toMatch(/^Bearer /)
    expect(server.requests[2]?.url).toBe('/storage/object?sig=abc')
    expect(server.requests[2]?.headers.authorization).toBeUndefined()
  })

  test('prints the signed link only with --url and warns on stderr', async () => {
    server = await startHttpServer({
      headers: {
        location:
          'https://storage.example.com/o?X-Amz-Date=20260917T100000Z&X-Amz-Expires=300&X-Amz-Signature=s',
        'request-id': 'req_url',
      },
      rawBody: '',
      status: 302,
    })

    const human = await apiKeyEnvironment(() =>
      runCommand('media download media/1 --url'),
    )
    expect(human.error).toBeUndefined()
    expect(human.stdout.trim()).toBe(
      'https://storage.example.com/o?X-Amz-Date=20260917T100000Z&X-Amz-Expires=300&X-Amz-Signature=s',
    )
    expect(human.stderr).toContain('expires within minutes')

    const json = await apiKeyEnvironment(() =>
      runCommand('media download media/1 --url --json'),
    )
    expect(JSON.parse(json.stdout)).toEqual({
      data: {
        expiresAt: '2026-09-17T10:05:00.000Z',
        mediaId: 'media/1',
        requestId: 'req_url',
        url: 'https://storage.example.com/o?X-Amz-Date=20260917T100000Z&X-Amz-Expires=300&X-Amz-Signature=s',
      },
    })
    expect(server.requests.map(({url}) => url)).toEqual([
      '/messaging/media/media%2F1',
      '/messaging/media/media%2F1',
    ])
  })

  test('explains when the API streams instead of issuing a link', async () => {
    server = await startHttpServer({rawBody: new Uint8Array([1])})

    const result = await apiKeyEnvironment(() =>
      runCommand('media download media_1 --url --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('issued no signed link')
    expect(result.stdout).toBe('')
  })

  test('requires an output path or --url, and rejects conflicting flags', async () => {
    server = await startHttpServer({body: {data: mediaInfo(), success: true}})

    const missing = await apiKeyEnvironment(() =>
      runCommand('media download media_1 --json'),
    )
    expect(exitCode(missing.error)).toBe(2)
    expect(missing.stderr).toContain('--output')

    const conflicting = await apiKeyEnvironment(() =>
      runCommand(`media download media_1 --url -o ${join(directory, 'x')}`),
    )
    expect(exitCode(conflicting.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  describe('--from-event', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    test('decrypts media from a stored webhook event without credentials', async () => {
      const fixture = whatsAppFixture(Buffer.from('decrypted image bytes'))
      const fetch = vi.fn<(input: unknown) => Promise<Response>>(() =>
        Promise.resolve(
          new Response(new Blob([new Uint8Array(fixture.encrypted)])),
        ),
      )
      vi.stubGlobal('fetch', fetch)
      const eventFile = join(directory, 'event.json')
      await writeFile(
        eventFile,
        JSON.stringify({
          event: 'message.received',
          payload: {id: 'm1', media: fixture.media, type: 'image'},
        }),
      )
      const output = join(directory, 'photo.jpg')

      const result = await withEnvironment(
        {POLYMORFA_API_KEY: undefined, POLYMORFA_CLIENT_TOKEN: undefined},
        () =>
          runCommand(
            `media download --from-event ${eventFile} -o ${output} --json`,
          ),
      )

      expect(result.error).toBeUndefined()
      expect(JSON.parse(result.stdout)).toEqual({
        data: {
          bytes: 21,
          mediaKind: 'image',
          mimeType: 'image/jpeg',
          path: output,
        },
      })
      await expect(readFile(output, 'utf8')).resolves.toBe(
        'decrypted image bytes',
      )
      expect(String(fetch.mock.calls[0]?.[0])).toBe(fixture.url)
      expect(result.stdout).not.toContain(fixture.media)
    })

    test('fails without output when the MAC does not match', async () => {
      const fixture = whatsAppFixture(Buffer.from('tampered payload'))
      const tampered = Buffer.from(fixture.encrypted)
      tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(new Response(new Blob([new Uint8Array(tampered)]))),
        ),
      )
      const eventFile = join(directory, 'event.json')
      await writeFile(
        eventFile,
        JSON.stringify({media: fixture.media, type: 'image'}),
      )

      const result = await runCommand(
        `media download --from-event ${eventFile} -o ${join(directory, 'out.jpg')} --json`,
      )

      expect(exitCode(result.error)).toBe(2)
      expect(result.stderr).toContain('media_enc_hash_mismatch')
      expect(result.stderr).not.toContain(fixture.media)
      await expect(readdir(directory)).resolves.toEqual(['event.json'])
    })

    test('rejects events without an encrypted media descriptor', async () => {
      const eventFile = join(directory, 'event.json')
      await writeFile(
        eventFile,
        JSON.stringify({payload: {mediaUrl: 'https://s3/x', type: 'image'}}),
      )

      const result = await runCommand(
        `media download --from-event ${eventFile} -o ${join(directory, 'o')} --json`,
      )
      expect(exitCode(result.error)).toBe(2)
      expect(result.stderr).toContain('downloaded by media ID')

      const both = await runCommand(
        `media download media_1 --from-event ${eventFile} -o ${join(directory, 'o')}`,
      )
      expect(exitCode(both.error)).toBe(2)
    })

    test('reports a missing event file as invalid input', async () => {
      const result = await runCommand(
        `media download --from-event ${join(directory, 'missing.json')} -o ${join(directory, 'o')} --json`,
      )
      expect(exitCode(result.error)).toBe(2)
      expect(result.stderr).toContain('could not be read (ENOENT)')
    })

    test('honors --timeout for the CDN download', async () => {
      const fixture = whatsAppFixture(Buffer.from('slow'))
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_input: unknown, init?: {signal?: AbortSignal}) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(init.signal?.reason as Error)
              })
            }),
        ),
      )
      const eventFile = join(directory, 'event.json')
      await writeFile(
        eventFile,
        JSON.stringify({media: fixture.media, type: 'image'}),
      )

      const result = await runCommand(
        `media download --from-event ${eventFile} -o ${join(directory, 'out.jpg')} --timeout 50 --json`,
      )
      expect(result.error).toBeDefined()
      expect(result.stderr).toContain('did not finish within 50 ms')
      await expect(readdir(directory)).resolves.toEqual(['event.json'])
    })
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})

function mediaInfo() {
  return {
    fileLength: 4,
    id: 'media/1',
    messageId: 'message_1',
    mimeType: 'image/png',
    persisted: false,
    s3Url: null,
    session: 'session_1',
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}

function whatsAppFixture(plaintext: Buffer): {
  readonly encrypted: Buffer
  readonly media: string
  readonly url: string
} {
  const mediaKey = Buffer.alloc(32, 7)
  const expanded = Buffer.from(
    hkdfSync('sha256', mediaKey, Buffer.alloc(0), 'WhatsApp Image Keys', 112),
  )
  const iv = expanded.subarray(0, 16)
  const cipher = createCipheriv('aes-256-cbc', expanded.subarray(16, 48), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const mac = createHmac('sha256', expanded.subarray(48, 80))
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, 10)
  const encrypted = Buffer.concat([ciphertext, mac])
  const url = 'https://mmg.whatsapp.net/v/t62.7118-24/fixture.enc?ccb=11-4'
  // ImageMessage field numbers: URL 1, fileSHA256 4, mediaKey 8, fileEncSHA256 9.
  const field = (number: number, value: Buffer): Buffer =>
    Buffer.concat([Buffer.from([(number << 3) | 2, value.length]), value])
  const media = Buffer.concat([
    field(1, Buffer.from(url)),
    field(4, createHash('sha256').update(plaintext).digest()),
    field(8, mediaKey),
    field(9, createHash('sha256').update(encrypted).digest()),
  ]).toString('base64')
  return {encrypted, media, url}
}
