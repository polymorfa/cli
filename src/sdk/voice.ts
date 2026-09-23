import {
  ELEVENLABS_TTS_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  VOICE_AUDIO_MAX_UPLOAD_BYTES,
  VOICE_AUDIO_STATUSES,
  VOICE_PROVIDERS,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  type ApiResponse,
  type KnownVoiceAudioUploadContentType,
  type RequestOptions,
  type UpdateVoiceAudioInput,
  type VoiceAudioAsset,
  type VoiceAudioPreview,
  type VoiceProviderCredential,
  type VoiceResourceDeleted,
} from '@polymorfa/sdk'

import type {ResolvedEnvironment} from '../context/environment.js'
import {createPlatformClient} from './client.js'

export {VOICE_AUDIO_MAX_UPLOAD_BYTES, VOICE_AUDIO_STATUSES, VOICE_PROVIDERS}
export type {
  VoiceAudioAsset,
  VoiceAudioPreview,
  VoiceProviderCredential,
  VoiceResourceDeleted,
}

const DEFAULT_BASE_URL = 'https://api.polymorfa.com'
const DEFAULT_TRANSFER_TIMEOUT_MS = 120_000

export interface VoiceAudioPage {
  readonly items: readonly VoiceAudioAsset[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface VoiceClient {
  listAudio(params: {
    projectId: string
    status?: string
    cursor?: string
    limit?: number
  }): Promise<ApiResponse<VoiceAudioPage>>
  uploadAudio(input: {
    projectId: string
    name: string
    bytes: Uint8Array
    contentType: KnownVoiceAudioUploadContentType
    retentionDays?: number
  }): Promise<ApiResponse<VoiceAudioAsset>>
  synthesizeAudio(input: {
    projectId: string
    name: string
    text: string
    provider: string
    voiceId: string
    model?: string
    credentialId?: string
    retentionDays?: number
  }): Promise<ApiResponse<VoiceAudioAsset>>
  retrieveAudio(
    assetId: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<VoiceAudioAsset>>
  updateAudio(
    assetId: string,
    input: UpdateVoiceAudioInput,
  ): Promise<ApiResponse<VoiceAudioAsset>>
  deleteAudio(assetId: string): Promise<ApiResponse<VoiceResourceDeleted>>
  previewAudio(assetId: string): Promise<ApiResponse<VoiceAudioPreview>>
  downloadPreview(
    preview: VoiceAudioPreview,
    maxBytes: number,
  ): Promise<Uint8Array>
  listCredentials(
    projectId?: string,
  ): Promise<ApiResponse<readonly VoiceProviderCredential[]>>
  createCredential(input: {
    provider: string
    label: string
    apiKey: string
    projectId?: string
  }): Promise<ApiResponse<VoiceProviderCredential>>
  retrieveCredential(
    credentialId: string,
  ): Promise<ApiResponse<VoiceProviderCredential>>
  verifyCredential(
    credentialId: string,
  ): Promise<ApiResponse<VoiceProviderCredential>>
  deleteCredential(
    credentialId: string,
  ): Promise<ApiResponse<VoiceResourceDeleted>>
}

function memberOf<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return (values as readonly string[]).includes(value)
}

/** The Platform API calls use the typed SDK. Only signed preview downloads use fetch. */
export function createVoiceClient(
  environment: ResolvedEnvironment,
  fetchImplementation: typeof fetch = fetch,
): VoiceClient {
  const voice = createPlatformClient(environment).voice
  const baseUrl = environment.baseUrl ?? DEFAULT_BASE_URL
  const transferTimeoutMs = environment.timeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS

  async function transfer<T>(
    url: URL,
    init: RequestInit,
    label: string,
    consume: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), transferTimeoutMs)
    try {
      const response = await fetchImplementation(url, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      })
      return await consume(response, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) {
        throw new PolymorfaTimeoutError(
          `The ${label} did not finish within ${transferTimeoutMs}ms.`,
          {cause: error, code: 'request_timeout'},
        )
      }
      if (error instanceof PolymorfaError) throw error
      throw new PolymorfaConnectionError(
        `The ${label} could not reach its URL.`,
        {cause: error, code: 'connection_error'},
      )
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async listAudio(params) {
      const {projectId, status, ...rest} = params
      if (status !== undefined && !memberOf(VOICE_AUDIO_STATUSES, status)) {
        throw new PolymorfaConfigurationError(
          'Unsupported voice audio status.',
          'status',
        )
      }
      const filters = {...rest, ...(status === undefined ? {} : {status})}
      const page = await voice.audio.list(projectId, filters)
      return {
        data: {
          items: page.items,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor ?? null,
        },
        metadata: page.response.metadata,
      }
    },
    uploadAudio: ({projectId, name, bytes, contentType, retentionDays}) =>
      voice.audio.upload(projectId, {
        name,
        body: bytes,
        contentType,
        ...(retentionDays === undefined ? {} : {retentionDays}),
      }),
    synthesizeAudio: ({projectId, provider, voiceId, model, ...fields}) => {
      if (provider === 'elevenlabs') {
        if (model !== undefined && !memberOf(ELEVENLABS_TTS_MODELS, model)) {
          throw new PolymorfaConfigurationError(
            'Unsupported ElevenLabs model.',
            'model',
          )
        }
        return voice.audio.synthesize(projectId, {
          ...fields,
          provider,
          voiceId,
          ...(model === undefined ? {} : {model}),
        })
      }
      if (provider === 'openai') {
        if (!memberOf(OPENAI_TTS_VOICES, voiceId)) {
          throw new PolymorfaConfigurationError(
            'Unsupported OpenAI voice.',
            'voice',
          )
        }
        if (model !== undefined && !memberOf(OPENAI_TTS_MODELS, model)) {
          throw new PolymorfaConfigurationError(
            'Unsupported OpenAI model.',
            'model',
          )
        }
        return voice.audio.synthesize(projectId, {
          ...fields,
          provider,
          voiceId,
          ...(model === undefined ? {} : {model}),
        })
      }
      throw new PolymorfaConfigurationError(
        'Unsupported voice provider.',
        'provider',
      )
    },
    retrieveAudio: (assetId, options) => voice.audio.retrieve(assetId, options),
    updateAudio: (assetId, input) => voice.audio.update(assetId, input),
    deleteAudio: (assetId) => voice.audio.delete(assetId),
    previewAudio: (assetId) => voice.audio.previewUrl(assetId),
    async downloadPreview(preview, maxBytes) {
      const url = capabilityUrl(baseUrl, preview.url, 'preview')
      return transfer(
        url,
        {method: 'GET'},
        'preview download',
        async (response, signal) => {
          if (!response.ok) {
            throw transferError(
              response,
              await safeBody(response, signal),
              'preview download',
            )
          }
          const declared = Number(response.headers.get('content-length'))
          if (Number.isFinite(declared) && declared > maxBytes) {
            await discardBody(response)
            throw tooLargePreview(maxBytes)
          }
          const bytes = await readBody(response, signal, maxBytes)
          if (bytes === undefined) throw tooLargePreview(maxBytes)
          return bytes
        },
      )
    },
    listCredentials: (projectId) =>
      voice.providerCredentials.list(
        projectId === undefined ? {} : {projectId},
      ),
    createCredential: (input) => {
      if (!memberOf(VOICE_PROVIDERS, input.provider)) {
        throw new PolymorfaConfigurationError(
          'Unsupported voice provider.',
          'provider',
        )
      }
      return voice.providerCredentials.create({
        ...input,
        provider: input.provider,
      })
    },
    retrieveCredential: (credentialId) =>
      voice.providerCredentials.retrieve(credentialId),
    verifyCredential: (credentialId) =>
      voice.providerCredentials.verify(credentialId),
    deleteCredential: (credentialId) =>
      voice.providerCredentials.delete(credentialId),
  }
}

/**
 * Resolve an upload or preview URL. It must use HTTPS (or HTTP on loopback)
 * and carry no credentials, matching the SDK's upload rules.
 */
function capabilityUrl(baseUrl: string, value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(value, `${baseUrl.replace(/\/+$/, '')}/`)
  } catch {
    throw new PolymorfaValidationError(
      `The API returned an invalid ${label} URL.`,
      {code: `invalid_${label}_url`},
    )
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  if (
    url.username !== '' ||
    url.password !== '' ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
  ) {
    throw new PolymorfaValidationError(
      `The ${label} URL must use HTTPS and must not contain credentials.`,
      {code: `invalid_${label}_url`},
    )
  }
  return url
}

/** Error bodies are only inspected for an error code. */
const MAX_ERROR_BODY_BYTES = 65_536

async function safeBody(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  let bytes: Uint8Array | undefined
  try {
    bytes = await readBody(response, signal, MAX_ERROR_BODY_BYTES)
  } catch (error) {
    // A timeout must surface as a timeout, not as the status error.
    if (signal.aborted) throw error
    return undefined
  }
  if (bytes === undefined || bytes.byteLength === 0) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

/**
 * Reads a response body incrementally. Returns undefined, after cancelling
 * the stream, as soon as more than maxBytes arrive. Aborting the signal
 * cancels the stream and rejects, even when the body source ignores it.
 */
async function readBody(
  response: Response,
  signal: AbortSignal,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const body = response.body
  if (body === null) return new Uint8Array()
  const reader = body.getReader()
  const onAbort = () => {
    reader.cancel(signal.reason).catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort, {once: true})
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      if (signal.aborted) throw abortReason(signal)
      const {done, value} = await reader.read()
      // A cancelled read resolves as done; never return a truncated body.
      if (signal.aborted) throw abortReason(signal)
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('The transfer was aborted.')
}

function transferError(
  response: Response,
  body: unknown,
  label: string,
): PolymorfaError {
  const bodyCode =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as {error?: {code?: unknown}}).error?.code === 'string'
      ? (body as {error: {code: string}}).error.code
      : undefined
  const status = response.status
  const options = {
    status,
    ...(bodyCode === undefined
      ? {
          code:
            status === 413 ? 'too_large' : `${label.replace(' ', '_')}_failed`,
        }
      : {code: bodyCode}),
  }
  const message =
    status === 413
      ? `The ${label} was refused: the file is larger than 16 MB.`
      : status === 415
        ? `The ${label} was refused: the content type does not match the upload.`
        : `The ${label} failed with status ${status}.`
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new PolymorfaValidationError(message, options)
  }
  if (status === 401 || status === 403) {
    return new PolymorfaAuthorizationError(
      `${message} The link may have expired; request a new one.`,
      options,
    )
  }
  if (status === 404) return new PolymorfaNotFoundError(message, options)
  if (status >= 500) return new PolymorfaServerError(message, options)
  return new PolymorfaError(message, options)
}

function tooLargePreview(maxBytes: number): PolymorfaError {
  return new PolymorfaServerError(
    `The preview is larger than ${maxBytes} bytes; nothing was written.`,
    {code: 'preview_too_large'},
  )
}
