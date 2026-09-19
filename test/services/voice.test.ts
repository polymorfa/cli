import {PassThrough, Readable} from 'node:stream'
import {describe, expect, test, vi} from 'vitest'

import {createVoiceClient, type VoiceClient} from '../../src/sdk/voice.js'
import {
  readProviderKey,
  uploadContentType,
  waitForAudio,
  type VoiceResult,
} from '../../src/services/voice.js'
import type {VoiceAudioAsset} from '../../src/sdk/voice.js'

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
