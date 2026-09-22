import {readdir, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {PassThrough, Readable} from 'node:stream'
import {describe, expect, test, vi} from 'vitest'

import {createVoiceClient, type VoiceClient} from '../../src/sdk/voice.js'
import {
  MAX_PREVIEW_BYTES,
  previewAudio,
  readProviderKey,
  uploadContentType,
  waitForAudio,
  type VoiceResult,
} from '../../src/services/voice.js'
import type {VoiceAudioAsset} from '../../src/sdk/voice.js'
import {temporaryDirectory} from '../support/fs.js'

const KEY = 'sk-provider-secret-0123456789'

function stdin(value: string | undefined, isTTY = false) {
  const stream = (
    value === undefined ? new PassThrough() : Readable.from([value])
  ) as Readable & {isTTY?: boolean}
  stream.isTTY = isTTY
  return stream
}

describe('readProviderKey', () => {
  test('prefers the default environment variable over standard input', async () => {
    await expect(
      readProviderKey({
        env: {POLYMORFA_VOICE_PROVIDER_KEY: ` ${KEY} `},
        stdin: stdin('other'),
      }),
    ).resolves.toBe(KEY)
  })

  test('reads piped standard input when no variable is set', async () => {
    await expect(
      readProviderKey({env: {}, stdin: stdin(`${KEY}\n`)}),
    ).resolves.toBe(KEY)
  })

  test('refuses a terminal so the key is never echoed', async () => {
    await expect(
      readProviderKey({env: {}, stdin: stdin(undefined, true)}),
    ).rejects.toThrow(/never read from an argument/)
  })

  test('refuses an unset named variable, a bad name, and an oversized key', async () => {
    await expect(
      readProviderKey({env: {}, keyEnv: 'MY_KEY', stdin: stdin(KEY)}),
    ).rejects.toThrow('Environment variable MY_KEY is not set.')
    await expect(
      readProviderKey({env: {}, keyEnv: 'not a name', stdin: stdin(KEY)}),
    ).rejects.toThrow('--key-env must name an environment variable.')
    await expect(
      readProviderKey({
        env: {MY_KEY: 'k'.repeat(513)},
        keyEnv: 'MY_KEY',
        stdin: stdin(KEY),
      }),
    ).rejects.toThrow('1 to 512 characters')
  })
})

describe('uploadContentType', () => {
  test('maps extensions case-insensitively and refuses others', () => {
    expect(uploadContentType('a.MP3')).toBe('audio/mpeg')
    expect(uploadContentType('a.opus')).toBe('audio/ogg')
    expect(() => uploadContentType('a.aac')).toThrow('Unsupported audio file')
    expect(() => uploadContentType('noext')).toThrow('(no extension)')
  })
})

describe('waitForAudio', () => {
  const asset = {
    id: '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10',
    status: 'transcoding',
  } as VoiceAudioAsset
  const submitted: VoiceResult<VoiceAudioAsset> = {
    data: asset,
    metadata: {attempts: 1, status: 201},
  }

  test('times out with request_timeout while the asset keeps processing', async () => {
    const retrieveAudio = vi.fn(() =>
      Promise.resolve({
        data: asset,
        metadata: {attempts: 1, headers: {}, status: 200},
      }),
    )
    const client = {retrieveAudio} as unknown as VoiceClient
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      await expect(
        waitForAudio(client, submitted, {
          sleep: (milliseconds) => {
            now += milliseconds
            return Promise.resolve()
          },
          timeoutSeconds: 5,
        }),
      ).rejects.toMatchObject({code: 'request_timeout'})
      expect(retrieveAudio).toHaveBeenCalledTimes(4)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('createVoiceClient', () => {
  const environment = {
    baseUrl: 'https://api.example.test',
    credential: {
      type: 'apiKey' as const,
      value:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
    surface: 'platform' as const,
  }
  const upload = {
    expiresAt: '2026-09-19T10:05:00.000Z',
    headers: {Authorization: 'Bearer leak', 'Content-Type': 'audio/wav'},
    maxBytes: 16_777_216,
    method: 'POST',
    url: 'https://uploads.example.test/u/token',
  }

  test('sends only the upload headers, never a credential', async () => {
    const fetch = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(
      () => Promise.resolve(new Response('{"storageId":"s"}', {status: 201})),
    )
    const client = createVoiceClient(
      environment,
      fetch as typeof globalThis.fetch,
    )

    await client.sendToUploadUrl(upload, new Uint8Array([1, 2]))

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toBe('https://uploads.example.test/u/token')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('content-type')).toBe('audio/wav')
    expect(init?.redirect).toBe('error')
  })

  test('refuses plain HTTP upload URLs and maps 413 and 415 without the URL', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('', {status: 413})))
    const client = createVoiceClient(environment, fetch)

    await expect(
      client.sendToUploadUrl(
        {...upload, url: 'http://uploads.example.test/u/token'},
        new Uint8Array([1]),
      ),
    ).rejects.toMatchObject({code: 'invalid_upload_url'})
    expect(fetch).not.toHaveBeenCalled()

    const tooLarge = client.sendToUploadUrl(upload, new Uint8Array([1]))
    await expect(tooLarge).rejects.toMatchObject({
      code: 'too_large',
      status: 413,
    })
    await expect(tooLarge).rejects.not.toThrow(/token/)

    fetch.mockImplementationOnce(() =>
      Promise.resolve(new Response('', {status: 415})),
    )
    await expect(
      client.sendToUploadUrl(upload, new Uint8Array([1])),
    ).rejects.toThrow('content type does not match')
  })
})

describe('voice transfers', () => {
  const ASSET_ID = '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10'
  const preview = {
    contentType: 'audio/ogg',
    expiresAt: '2026-09-19T10:05:00.000Z',
    url: 'https://previews.example.test/p/token',
  }
  const upload = {
    expiresAt: '2026-09-19T10:05:00.000Z',
    headers: {'Content-Type': 'audio/wav'},
    maxBytes: 16_777_216,
    method: 'PUT',
    url: 'https://uploads.example.test/u/token',
  }

  function environment(timeoutMs?: number) {
    return {
      baseUrl: 'https://api.example.test',
      credential: {
        type: 'apiKey' as const,
        value:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      surface: 'platform' as const,
      ...(timeoutMs === undefined ? {} : {timeoutMs}),
    }
  }

  /** Headers arrive at once; the body never produces a byte. */
  function stalledBody() {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull: () => new Promise<void>(() => undefined),
    })
    return {body, cancel}
  }

  /** An endless body with no Content-Length that counts what it produced. */
  function endlessBody(chunkBytes: number) {
    const chunk = new Uint8Array(chunkBytes)
    const state = {cancelled: false, produced: 0}
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        state.cancelled = true
      },
      pull(controller) {
        state.produced += chunk.byteLength
        controller.enqueue(chunk)
      },
    })
    return {body, state}
  }

  // The mocked fetch ignores the abort signal, so these tests prove the
  // client cancels the body itself rather than relying on the transport.
  function fetchReturning(response: () => Response) {
    return vi.fn(() => Promise.resolve(response())) as typeof fetch
  }

  test('times out a preview whose body stalls after the headers', async () => {
    const {body, cancel} = stalledBody()
    const client = createVoiceClient(
      environment(50),
      fetchReturning(() => new Response(body, {status: 200})),
    )
    const started = Date.now()

    const download = client.downloadPreview(preview, 1024)

    await expect(download).rejects.toMatchObject({code: 'request_timeout'})
    await expect(download).rejects.toThrow(
      'The preview download did not finish within 50ms.',
    )
    await expect(download).rejects.not.toThrow(/token/)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(cancel).toHaveBeenCalled()
  })

  test('times out an error response whose body stalls after the headers', async () => {
    const preview500 = stalledBody()
    const upload500 = stalledBody()
    const previewClient = createVoiceClient(
      environment(50),
      fetchReturning(() => new Response(preview500.body, {status: 500})),
    )
    const uploadClient = createVoiceClient(
      environment(50),
      fetchReturning(() => new Response(upload500.body, {status: 403})),
    )

    await expect(
      previewClient.downloadPreview(preview, 1024),
    ).rejects.toMatchObject({code: 'request_timeout'})
    await expect(
      uploadClient.sendToUploadUrl(upload, new Uint8Array([1])),
    ).rejects.toMatchObject({code: 'request_timeout'})
    expect(preview500.cancel).toHaveBeenCalled()
    expect(upload500.cancel).toHaveBeenCalled()
  })

  test('still reports the status and body code when the error body arrives', async () => {
    const client = createVoiceClient(
      environment(50),
      fetchReturning(
        () => new Response('{"error":{"code":"link_expired"}}', {status: 403}),
      ),
    )

    await expect(
      client.sendToUploadUrl(upload, new Uint8Array([1])),
    ).rejects.toMatchObject({code: 'link_expired', status: 403})
  })

  test('stops reading a preview without Content-Length once it passes the limit', async () => {
    const maxBytes = 10_000
    const chunkBytes = 1_000
    const {body, state} = endlessBody(chunkBytes)
    const client = createVoiceClient(
      environment(5_000),
      fetchReturning(() => new Response(body, {status: 200})),
    )

    await expect(
      client.downloadPreview(preview, maxBytes),
    ).rejects.toMatchObject({code: 'preview_too_large'})
    expect(state.cancelled).toBe(true)
    // The reader stops on the first chunk past the limit; the stream may
    // have queued one more chunk ahead of the reader.
    expect(state.produced).toBeGreaterThan(maxBytes)
    expect(state.produced).toBeLessThanOrEqual(maxBytes + 2 * chunkBytes)
  })

  test('refuses a declared oversize preview before reading it', async () => {
    const {body, state} = endlessBody(1_000)
    const client = createVoiceClient(
      environment(5_000),
      fetchReturning(
        () =>
          new Response(body, {
            headers: {'content-length': '10001'},
            status: 200,
          }),
      ),
    )

    await expect(client.downloadPreview(preview, 10_000)).rejects.toMatchObject(
      {code: 'preview_too_large'},
    )
    expect(state.cancelled).toBe(true)
    expect(state.produced).toBeLessThanOrEqual(1_000)
  })

  test('returns a preview at exactly the limit', async () => {
    const client = createVoiceClient(
      environment(5_000),
      fetchReturning(() => new Response(new Uint8Array(1_000), {status: 200})),
    )

    await expect(client.downloadPreview(preview, 1_000)).resolves.toHaveLength(
      1_000,
    )
  })

  function previewClient(fetchImplementation: typeof fetch, timeoutMs: number) {
    const client = createVoiceClient(
      environment(timeoutMs),
      fetchImplementation,
    )
    return {
      ...client,
      previewAudio: () =>
        Promise.resolve({
          data: preview,
          metadata: {attempts: 1, headers: {}, status: 200},
        }),
    } satisfies VoiceClient
  }

  test('writes no output file when an unbounded preview is refused', async () => {
    const directory = await temporaryDirectory()
    try {
      const {body, state} = endlessBody(1_048_576)
      const client = previewClient(
        fetchReturning(() => new Response(body, {status: 200})),
        30_000,
      )

      await expect(
        previewAudio(client, ASSET_ID, {
          output: join(directory, 'preview.ogg'),
        }),
      ).rejects.toMatchObject({code: 'preview_too_large'})
      expect(state.cancelled).toBe(true)
      expect(state.produced).toBeLessThanOrEqual(
        MAX_PREVIEW_BYTES + 2 * 1_048_576,
      )
      await expect(readdir(directory)).resolves.toEqual([])
    } finally {
      await rm(directory, {force: true, recursive: true})
    }
  })

  test('writes no output file when the preview body times out', async () => {
    const directory = await temporaryDirectory()
    try {
      const {body} = stalledBody()
      const client = previewClient(
        fetchReturning(() => new Response(body, {status: 200})),
        50,
      )

      await expect(
        previewAudio(client, ASSET_ID, {
          output: join(directory, 'preview.ogg'),
        }),
      ).rejects.toMatchObject({code: 'request_timeout'})
      await expect(readdir(directory)).resolves.toEqual([])
    } finally {
      await rm(directory, {force: true, recursive: true})
    }
  })
})
