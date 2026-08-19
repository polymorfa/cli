import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

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
    expect(server.requests[0]?.url).toBe('/api/media/media%2F1/info')
  })

  test('rejects a client token before a Messaging media request', async () => {
    server = await startHttpServer({body: {data: mediaInfo(), success: true}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
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
      '/api/media/media%2F1/info',
      '/api/media/media%2F1',
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
    expect(result.stderr).toContain('is 5 bytes')
    await expect(readFile(output)).rejects.toMatchObject({code: 'ENOENT'})
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
      url: '/api/media/media%2F1/download-and-save',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('persist_1')
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_test-key',
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
