import {runCommand} from '@oclif/test'
import {mkdtemp, readFile, rm, truncate, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PROVIDER_KEY = 'sk-provider-secret-0123456789'
const PROJECT = '018f0000-0000-7000-8000-000000000002'
const ASSET_ID = '6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10'
const CREDENTIAL_ID = '7a2d3e4f-5b6c-4d7e-8f90-1a2b3c4d5e6f'

const asset = {
  contentSha256: null,
  createdAt: '2026-09-19T10:00:00.000Z',
  durationMs: null,
  expiresAt: null,
  failureReason: null,
  id: ASSET_ID,
  inUseCount: 0,
  name: 'Greeting',
  originalContentType: 'audio/mpeg',
  originalFormat: 'mp3',
  projectId: PROJECT,
  readyAt: null,
  retentionDays: null,
  revision: 1,
  sizeBytes: 4,
  source: 'upload',
  status: 'transcoding',
  tts: null,
  updatedAt: '2026-09-19T10:00:00.000Z',
}

const readyAsset = {
  ...asset,
  contentSha256: 'ab'.repeat(32),
  durationMs: 12_345,
  readyAt: '2026-09-19T10:00:05.000Z',
  revision: 2,
  status: 'ready',
}

const credential = {
  createdAt: '2026-09-19T10:00:00.000Z',
  id: CREDENTIAL_ID,
  keyFingerprint: '1a2b3c4d',
  label: 'Studio key',
  lastError: null,
  projectId: null,
  provider: 'elevenlabs',
  revision: 1,
  status: 'valid',
  updatedAt: '2026-09-19T10:00:00.000Z',
  verifiedAt: '2026-09-19T10:00:00.000Z',
}

function ok(data: unknown, status = 200) {
  return {body: {data, success: true}, status}
}

function failure(status: number, code: string, message: string) {
  return {body: {error: {code, message}, success: false}, status}
}

describe('voice audio commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('uploads a file without the credential, completes it, and waits until ready', async () => {
    server = await startHttpSequenceServer([
      ok(
        {
          asset: {...asset, status: 'pending_upload'},
          upload: {
            expiresAt: '2026-09-19T10:05:00.000Z',
            headers: {'Content-Type': 'audio/mpeg'},
            maxBytes: 16_777_216,
            method: 'POST',
            url: '/upload/capability-token',
          },
        },
        201,
      ),
      {body: {storageId: 'storage_1'}, status: 201},
      ok(asset),
      ok(readyAsset),
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-voice-'))
    const file = join(directory, 'greeting.MP3')
    await writeFile(file, Buffer.from([0x49, 0x44, 0x33, 0x04]))

    const uploaded = await apiKey(() =>
      runCommand(
        `voice audio upload ${file} --name Greeting --retention-days 30 --wait --project ${PROJECT}`,
      ),
    )

    expect(uploaded.error, uploaded.stderr).toBeUndefined()
    expect(uploaded.stdout).toContain('Status\tready')
    expect(uploaded.stdout).toContain('Duration\t12.3s')
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /platform/voice/audio',
      'POST /upload/capability-token',
      `POST /platform/voice/audio/${ASSET_ID}/complete`,
      `GET /platform/voice/audio/${ASSET_ID}`,
    ])
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      contentType: 'audio/mpeg',
      name: 'Greeting',
      projectId: PROJECT,
      retentionDays: 30,
      sizeBytes: 4,
    })
    const upload = server.requests[1]
    expect(upload?.headers.authorization).toBeUndefined()
    expect(upload?.headers['content-type']).toBe('audio/mpeg')
    expect(Buffer.from(upload?.body ?? '', 'utf8')).toHaveLength(4)
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`)
  })

  test('detects the content type from each supported extension', async () => {
    const types: Record<string, string> = {
      'a.m4a': 'audio/x-m4a',
      'a.mp4': 'audio/mp4',
      'a.ogg': 'audio/ogg',
      'a.opus': 'audio/ogg',
      'a.wav': 'audio/wav',
    }
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-voice-'))
    for (const [name, contentType] of Object.entries(types)) {
      server = await startHttpSequenceServer([
        failure(403, 'voice_not_enabled', 'Voice Automation is not enabled.'),
      ])
      const file = join(directory, name)
      await writeFile(file, 'RIFF')
      await apiKey(() =>
        runCommand(
          `voice audio upload ${file} --name Clip --project ${PROJECT}`,
        ),
      )
      expect(
        (JSON.parse(server.requests[0]?.body ?? '') as {contentType: string})
          .contentType,
      ).toBe(contentType)
      await server.close()
      server = undefined
    }
  })

  test('refuses unsupported, empty, and oversized files before calling the API', async () => {
    server = await startHttpSequenceServer([ok(asset)])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-voice-'))
    const flac = join(directory, 'clip.flac')
    await writeFile(flac, 'fLaC')
    const empty = join(directory, 'empty.wav')
    await writeFile(empty, '')
    const large = join(directory, 'large.wav')
    await writeFile(large, '')
    await truncate(large, 16_777_217)
    const limit = join(directory, 'limit.wav')
    await writeFile(limit, '')
    await truncate(limit, 16_777_216)

    const unsupported = await apiKey(() =>
      runCommand(`voice audio upload ${flac} --name Clip --project ${PROJECT}`),
    )
    const emptied = await apiKey(() =>
      runCommand(
        `voice audio upload ${empty} --name Clip --project ${PROJECT}`,
      ),
    )
    const oversized = await apiKey(() =>
      runCommand(
        `voice audio upload ${large} --name Clip --project ${PROJECT} --json`,
      ),
    )
    const missingProject = await apiKey(() =>
      runCommand(`voice audio upload ${limit} --name Clip`),
    )
    const badRetention = await apiKey(() =>
      runCommand(
        `voice audio upload ${limit} --name Clip --retention-days 0 --project ${PROJECT}`,
      ),
    )

    expect(exitCode(unsupported.error)).toBe(2)
    expect(unsupported.stderr).toContain('Unsupported audio file type .flac')
    expect(exitCode(emptied.error)).toBe(2)
    expect(exitCode(oversized.error)).toBe(2)
    expect(
      (JSON.parse(oversized.stderr) as {error: {message: string}}).error
        .message,
    ).toContain('limited to 16 MB')
    expect(exitCode(missingProject.error)).toBe(2)
    expect(exitCode(badRetention.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test('exits 13 when the awaited audio fails processing', async () => {
    server = await startHttpSequenceServer([
      ok({...asset, source: 'tts', status: 'transcoding'}, 201),
      ok({
        ...asset,
        failureReason: 'tts_failed',
        source: 'tts',
        status: 'failed',
      }),
    ])

    const failed = await apiKey(() =>
      runCommand(
        `voice audio tts --name Welcome --text Hello --provider openai --voice alloy --wait --project ${PROJECT} --json`,
      ),
    )

    expect(exitCode(failed.error)).toBe(13)
    expect(JSON.parse(failed.stderr)).toMatchObject({
      error: {
        code: 'voice_asset_failed',
        message: expect.stringContaining('tts_failed') as unknown,
      },
    })
  })

  test('maps voice_not_enabled and gate_limit_reached to distinct exit codes', async () => {
    server = await startHttpSequenceServer([
      failure(
        403,
        'voice_not_enabled',
        'Voice Automation is not enabled for this team.',
      ),
      failure(402, 'gate_limit_reached', 'The voice audio limit is reached.'),
      failure(403, 'permission_denied', 'Denied.'),
      failure(402, 'payment_required', 'Add credit.'),
    ])

    const notEnabled = await apiKey(() =>
      runCommand(
        `voice audio tts --name A --text Hi --provider openai --voice alloy --project ${PROJECT} --json`,
      ),
    )
    const limited = await apiKey(() =>
      runCommand(
        `voice audio tts --name A --text Hi --provider openai --voice alloy --project ${PROJECT}`,
      ),
    )
    const denied = await apiKey(() =>
      runCommand(
        `voice audio tts --name A --text Hi --provider openai --voice alloy --project ${PROJECT}`,
      ),
    )
    const unpaid = await apiKey(() =>
      runCommand(
        `voice audio tts --name A --text Hi --provider openai --voice alloy --project ${PROJECT}`,
      ),
    )

    expect(exitCode(notEnabled.error)).toBe(6)
    expect(JSON.parse(notEnabled.stderr)).toMatchObject({
      error: {category: 'authorization', code: 'voice_not_enabled'},
    })
    expect(exitCode(limited.error)).toBe(7)
    expect(limited.stderr).toContain('The voice audio limit is reached.')
    expect(exitCode(denied.error)).toBe(3)
    expect(exitCode(unpaid.error)).toBe(4)
  })

  test('synthesizes text from a file with a stored credential', async () => {
    server = await startHttpSequenceServer([
      ok(
        {
          ...asset,
          source: 'tts',
          tts: {
            characters: 11,
            credentialId: CREDENTIAL_ID,
            keySource: 'customer',
            model: 'eleven_flash_v2_5',
            provider: 'elevenlabs',
            text: 'Hello there',
            voiceId: 'voice123',
          },
        },
        201,
      ),
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-voice-'))
    const text = join(directory, 'menu.txt')
    await writeFile(text, 'Hello there\n')

    const created = await apiKey(() =>
      runCommand(
        `voice audio tts --name Menu --text-file ${text} --provider elevenlabs --voice voice123 --model eleven_flash_v2_5 --credential ${CREDENTIAL_ID} --retention-days 7 --project ${PROJECT}`,
      ),
    )
    const badVoice = await apiKey(() =>
      runCommand(
        `voice audio tts --name Menu --text Hi --provider elevenlabs --voice bad-voice! --project ${PROJECT}`,
      ),
    )
    const tooLong = await apiKey(() =>
      runCommand(
        `voice audio tts --name Menu --text ${'a'.repeat(4097)} --provider openai --voice alloy --project ${PROJECT}`,
      ),
    )
    const both = await apiKey(() =>
      runCommand(
        `voice audio tts --name Menu --text Hi --text-file ${text} --provider openai --voice alloy --project ${PROJECT}`,
      ),
    )
    const badProvider = await apiKey(() =>
      runCommand(
        `voice audio tts --name Menu --text Hi --provider azure --voice alloy --project ${PROJECT}`,
      ),
    )

    expect(created.error, created.stderr).toBeUndefined()
    expect(created.stdout).toContain('TTS key\tcustomer')
    expect(created.stdout).toContain('pass --wait')
    expect(server.requests[0]?.url).toBe('/platform/voice/audio/tts')
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      credentialId: CREDENTIAL_ID,
      model: 'eleven_flash_v2_5',
      name: 'Menu',
      projectId: PROJECT,
      provider: 'elevenlabs',
      retentionDays: 7,
      text: 'Hello there',
      voiceId: 'voice123',
    })
    expect(exitCode(badVoice.error)).toBe(2)
    expect(exitCode(tooLong.error)).toBe(2)
    expect(exitCode(both.error)).toBe(2)
    expect(exitCode(badProvider.error)).toBe(2)
    expect(server.requests).toHaveLength(1)
  })

  test('rejects provider-specific voices and models before sending TTS requests', async () => {
    server = await startHttpSequenceServer([ok(asset)])
    const base = `voice audio tts --name Greeting --text Hello --project ${PROJECT}`
    const badVoice = await apiKey(() =>
      runCommand(`${base} --provider openai --voice unsupported --json`),
    )
    const badOpenAiModel = await apiKey(() =>
      runCommand(`${base} --provider openai --voice alloy --model unsupported`),
    )
    const badElevenModel = await apiKey(() =>
      runCommand(
        `${base} --provider elevenlabs --voice voice123 --model unsupported --json`,
      ),
    )

    expect(exitCode(badVoice.error)).toBe(2)
    expect(JSON.parse(badVoice.stderr)).toMatchObject({
      error: {category: 'configuration', message: 'Unsupported OpenAI voice.'},
    })
    expect(exitCode(badOpenAiModel.error)).toBe(2)
    expect(badOpenAiModel.stderr).toContain('Unsupported OpenAI model.')
    expect(exitCode(badElevenModel.error)).toBe(2)
    expect(JSON.parse(badElevenModel.stderr)).toMatchObject({
      error: {
        category: 'configuration',
        message: 'Unsupported ElevenLabs model.',
      },
    })
    expect(server.requests).toHaveLength(0)
  })

  test('lists with filters and shows the next cursor', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: [readyAsset],
          page: {hasMore: true, nextCursor: 'cursor_2'},
          success: true,
        },
      },
      {
        body: {
          data: [],
          page: {hasMore: false, nextCursor: null},
          success: true,
        },
      },
    ])

    const listed = await apiKey(() =>
      runCommand(
        `voice audio list --status ready --limit 10 --cursor cursor_1 --project ${PROJECT}`,
      ),
    )
    const json = await apiKey(() =>
      runCommand(`voice audio list --project ${PROJECT} --json`),
    )
    const badStatus = await apiKey(() =>
      runCommand(`voice audio list --status done --project ${PROJECT}`),
    )

    expect(listed.error, listed.stderr).toBeUndefined()
    expect(listed.stdout).toBe(
      `${ASSET_ID}\tGreeting\tupload\tready\t12.3s\t2026-09-19T10:00:00.000Z\nMore results: --cursor cursor_2\n`,
    )
    expect(server.requests[0]?.url).toBe(
      `/platform/voice/audio?projectId=${PROJECT}&status=ready&cursor=cursor_1&limit=10`,
    )
    expect(JSON.parse(json.stdout)).toMatchObject({
      data: [],
      page: {hasMore: false, nextCursor: null},
    })
    expect(exitCode(badStatus.error)).toBe(2)
    expect(server.requests).toHaveLength(2)
  })

  test('views and updates with a revision guard', async () => {
    server = await startHttpSequenceServer([
      ok(readyAsset),
      ok({...readyAsset, name: 'Greeting v2', revision: 3}),
      ok({...readyAsset, retentionDays: null, revision: 4}),
      failure(409, 'voice_asset_revision_conflict', 'The asset changed.'),
    ])

    const viewed = await apiKey(() =>
      runCommand(`voice audio view ${ASSET_ID}`),
    )
    const renamed = await apiKey(() =>
      runCommand(
        `voice audio update ${ASSET_ID} --name "Greeting v2" --expected-revision 2`,
      ),
    )
    const forever = await apiKey(() =>
      runCommand(`voice audio update ${ASSET_ID} --retention-days none`),
    )
    const stale = await apiKey(() =>
      runCommand(
        `voice audio update ${ASSET_ID} --retention-days 5 --expected-revision 2`,
      ),
    )
    const nothing = await apiKey(() =>
      runCommand(`voice audio update ${ASSET_ID} --expected-revision 2`),
    )
    const badId = await apiKey(() => runCommand('voice audio view nope'))

    expect(viewed.stdout).toContain('Content SHA-256\t' + 'ab'.repeat(32))
    expect(viewed.stdout).toContain('Retention\tkept until deleted')
    expect(renamed.stdout).toContain('Name\tGreeting v2')
    expect(server.requests.map(({body, method}) => [method, body])).toEqual([
      ['GET', ''],
      ['PATCH', JSON.stringify({expectedRevision: 2, name: 'Greeting v2'})],
      ['PATCH', JSON.stringify({retentionDays: null})],
      ['PATCH', JSON.stringify({expectedRevision: 2, retentionDays: 5})],
    ])
    expect(forever.error).toBeUndefined()
    expect(exitCode(stale.error)).toBe(4)
    expect(stale.stderr).toContain('The asset changed.')
    expect(exitCode(nothing.error)).toBe(2)
    expect(exitCode(badId.error)).toBe(2)
  })

  test('requires confirmation to delete and reports audio in use', async () => {
    server = await startHttpSequenceServer([
      ok({deleted: true, id: ASSET_ID}),
      failure(409, 'voice_asset_in_use', 'A campaign uses this audio.'),
    ])

    const unconfirmed = await apiKey(() =>
      runCommand(`voice audio delete ${ASSET_ID}`),
    )
    const deleted = await apiKey(() =>
      runCommand(`voice audio delete ${ASSET_ID} --yes`),
    )
    const inUse = await apiKey(() =>
      runCommand(`voice audio delete ${ASSET_ID} --yes --json`),
    )

    expect(exitCode(unconfirmed.error)).toBe(2)
    expect(deleted.stdout).toBe(`Deleted audio ${ASSET_ID}.\n`)
    expect(exitCode(inUse.error)).toBe(4)
    expect(JSON.parse(inUse.stderr)).toMatchObject({
      error: {code: 'voice_asset_in_use'},
    })
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `DELETE /platform/voice/audio/${ASSET_ID}`,
      `DELETE /platform/voice/audio/${ASSET_ID}`,
    ])
  })

  test('prints the preview link or downloads it without the credential', async () => {
    const preview = {
      contentType: 'audio/ogg',
      expiresAt: '2026-09-19T10:05:00.000Z',
      url: '/previews/signed-capability',
    }
    server = await startHttpSequenceServer([
      ok(preview),
      ok(preview),
      {rawBody: Buffer.from('OggS-audio')},
      failure(409, 'asset_not_ready', 'The audio is not ready.'),
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-voice-'))
    const output = join(directory, 'greeting.ogg')

    const printed = await apiKey(() =>
      runCommand(`voice audio preview ${ASSET_ID}`),
    )
    const downloaded = await apiKey(() =>
      runCommand(`voice audio preview ${ASSET_ID} --output ${output}`),
    )
    const exists = await apiKey(() =>
      runCommand(`voice audio preview ${ASSET_ID} --output ${output}`),
    )
    const notReady = await apiKey(() =>
      runCommand(`voice audio preview ${ASSET_ID}`),
    )

    expect(printed.stdout).toContain('/previews/signed-capability')
    expect(printed.stdout).toContain('Treat the link as a secret.')
    expect(downloaded.error, downloaded.stderr).toBeUndefined()
    expect(downloaded.stdout).toContain('Saved 10 bytes of audio/ogg')
    expect(await readFile(output, 'utf8')).toBe('OggS-audio')
    expect(server.requests[2]?.url).toBe('/previews/signed-capability')
    expect(server.requests[2]?.headers.authorization).toBeUndefined()
    expect(exitCode(exists.error)).toBe(4)
    expect(exitCode(notReady.error)).toBe(4)
    expect(notReady.stderr).toContain('The audio is not ready.')
    // The existing output file is refused before any request.
    expect(
      server.requests.slice(0, 4).map(({method, url}) => `${method} ${url}`),
    ).toEqual([
      `GET /platform/voice/audio/${ASSET_ID}/preview`,
      `GET /platform/voice/audio/${ASSET_ID}/preview`,
      'GET /previews/signed-capability',
      `GET /platform/voice/audio/${ASSET_ID}/preview`,
    ])
  })

  test('omits the signed link from JSON after downloading a preview', async () => {
    const signedUrl = '/previews/signed-capability'
    server = await startHttpSequenceServer([
      ok({
        contentType: 'audio/ogg',
        expiresAt: '2026-09-19T10:05:00.000Z',
        url: signedUrl,
      }),
      {rawBody: Buffer.from('OggS-audio')},
    ])
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-voice-'))
    const output = join(directory, 'greeting.ogg')

    const downloaded = await apiKey(() =>
      runCommand(`voice audio preview ${ASSET_ID} --output ${output} --json`),
    )

    expect(downloaded.error, downloaded.stderr).toBeUndefined()
    expect(JSON.parse(downloaded.stdout)).toMatchObject({
      data: {download: {bytes: 10, path: output}},
    })
    expect(downloaded.stdout).not.toContain(signedUrl)
    expect(await readFile(output, 'utf8')).toBe('OggS-audio')
    expect(server.requests[1]?.url).toBe(signedUrl)
    expect(server.requests[1]?.headers.authorization).toBeUndefined()
  })

  async function apiKey<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_VOICE_PROVIDER_KEY: undefined,
      },
      run,
    )
  }
})

describe('voice credential commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('adds a key from the default environment variable and never prints it', async () => {
    server = await startHttpSequenceServer([ok(credential, 201)])

    const added = await apiKey(
      () =>
        runCommand(
          'voice credential add --provider elevenlabs --label "Studio key" --json',
        ),
      {POLYMORFA_VOICE_PROVIDER_KEY: PROVIDER_KEY},
    )

    expect(added.error, added.stderr).toBeUndefined()
    expect(JSON.parse(added.stdout)).toMatchObject({
      data: {keyFingerprint: '1a2b3c4d', projectId: null},
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      apiKey: PROVIDER_KEY,
      label: 'Studio key',
      provider: 'elevenlabs',
    })
    expect(added.stdout).not.toContain(PROVIDER_KEY)
    expect(added.stderr).not.toContain(PROVIDER_KEY)
  })

  test('adds a project key from a named variable or standard input', async () => {
    server = await startHttpSequenceServer([
      ok({...credential, projectId: PROJECT, provider: 'openai'}, 201),
      ok({...credential, projectId: PROJECT, provider: 'openai'}, 201),
    ])

    const fromNamed = await apiKey(
      () =>
        runCommand(
          `voice credential add --provider openai --label Support --key-env OPENAI_TEST_KEY --project ${PROJECT}`,
        ),
      {OPENAI_TEST_KEY: PROVIDER_KEY},
    )
    const fromStdin = await apiKey(() =>
      withStdin(`${PROVIDER_KEY}\n`, () =>
        runCommand(
          `voice credential add --provider openai --label Support --project ${PROJECT}`,
        ),
      ),
    )
    const missingNamed = await apiKey(() =>
      runCommand(
        'voice credential add --provider openai --label Support --key-env OPENAI_TEST_KEY',
      ),
    )
    const keyFlag = await apiKey(() =>
      runCommand(
        `voice credential add --provider openai --label Support --key ${PROVIDER_KEY}`,
      ),
    )

    expect(fromNamed.error, fromNamed.stderr).toBeUndefined()
    expect(fromNamed.stdout).toContain(`Project\t${PROJECT}`)
    expect(fromStdin.error, fromStdin.stderr).toBeUndefined()
    for (const request of server.requests) {
      expect(JSON.parse(request.body)).toEqual({
        apiKey: PROVIDER_KEY,
        label: 'Support',
        projectId: PROJECT,
        provider: 'openai',
      })
    }
    expect(exitCode(missingNamed.error)).toBe(2)
    expect(missingNamed.stderr).toContain('OPENAI_TEST_KEY is not set')
    expect(exitCode(keyFlag.error)).toBe(2)
    expect(server.requests).toHaveLength(2)
    for (const output of [fromNamed, fromStdin, missingNamed]) {
      expect(output.stdout).not.toContain(PROVIDER_KEY)
      expect(output.stderr).not.toContain(PROVIDER_KEY)
    }
  })

  test('redacts the key from a rejected credential error', async () => {
    server = await startHttpSequenceServer([
      failure(
        422,
        'provider_credential_invalid',
        `The provider rejected ${PROVIDER_KEY}.`,
      ),
      failure(403, 'voice_not_enabled', 'Voice Automation is not enabled.'),
    ])

    const rejected = await apiKey(
      () =>
        runCommand('voice credential add --provider openai --label Bad --json'),
      {POLYMORFA_VOICE_PROVIDER_KEY: PROVIDER_KEY},
    )
    const notEnabled = await apiKey(
      () => runCommand('voice credential add --provider openai --label Bad'),
      {POLYMORFA_VOICE_PROVIDER_KEY: PROVIDER_KEY},
    )

    expect(exitCode(rejected.error)).toBe(2)
    expect(JSON.parse(rejected.stderr)).toMatchObject({
      error: {code: 'provider_credential_invalid'},
    })
    expect(rejected.stderr).toContain('[REDACTED]')
    expect(rejected.stderr).not.toContain(PROVIDER_KEY)
    expect(exitCode(notEnabled.error)).toBe(6)
  })

  test('lists, views, verifies, and deletes credentials', async () => {
    server = await startHttpSequenceServer([
      ok([credential, {...credential, id: ASSET_ID, projectId: PROJECT}]),
      ok(credential),
      ok({...credential, lastError: 'quota_exceeded', status: 'invalid'}),
      failure(503, 'provider_unavailable', 'The provider did not answer.'),
      ok({deleted: true, id: CREDENTIAL_ID}),
    ])

    const listed = await apiKey(() =>
      runCommand(`voice credential list --project ${PROJECT}`),
    )
    const viewed = await apiKey(() =>
      runCommand(`voice credential view ${CREDENTIAL_ID}`),
    )
    const verified = await apiKey(() =>
      runCommand(`voice credential verify ${CREDENTIAL_ID}`),
    )
    const unavailable = await apiKey(() =>
      runCommand(`voice credential verify ${CREDENTIAL_ID}`),
    )
    const unconfirmed = await apiKey(() =>
      runCommand(`voice credential delete ${CREDENTIAL_ID}`),
    )
    const deleted = await apiKey(() =>
      runCommand(`voice credential delete ${CREDENTIAL_ID} --yes`),
    )

    expect(listed.stdout).toBe(
      [
        `${CREDENTIAL_ID}\televenlabs\tStudio key\tteam-wide\tvalid\t1a2b3c4d`,
        `${ASSET_ID}\televenlabs\tStudio key\t${PROJECT}\tvalid\t1a2b3c4d`,
        '',
      ].join('\n'),
    )
    expect(viewed.stdout).toContain('Key fingerprint\t1a2b3c4d')
    expect(verified.stdout).toContain('Status\tinvalid')
    expect(verified.stdout).toContain('Last error\tquota_exceeded')
    expect(exitCode(unavailable.error)).toBe(5)
    expect(exitCode(unconfirmed.error)).toBe(2)
    expect(deleted.stdout).toBe(
      `Deleted provider credential ${CREDENTIAL_ID}.\n`,
    )
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/voice/provider-credentials?projectId=${PROJECT}`,
      `GET /platform/voice/provider-credentials/${CREDENTIAL_ID}`,
      `POST /platform/voice/provider-credentials/${CREDENTIAL_ID}/verify`,
      `POST /platform/voice/provider-credentials/${CREDENTIAL_ID}/verify`,
      `DELETE /platform/voice/provider-credentials/${CREDENTIAL_ID}`,
    ])
  })

  async function apiKey<T>(
    run: () => Promise<T>,
    extra: Readonly<Record<string, string | undefined>> = {},
  ): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        OPENAI_TEST_KEY: undefined,
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_VOICE_PROVIDER_KEY: undefined,
        ...extra,
      },
      run,
    )
  }
})

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}

async function withStdin<T>(value: string, run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: Readable.from([value]),
  })
  try {
    return await run()
  } finally {
    if (descriptor !== undefined)
      Object.defineProperty(process, 'stdin', descriptor)
  }
}
