import {
  PolymorfaAuthorizationError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  type ApiResponse,
  type QueryValue,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {ResolvedEnvironment} from '../context/environment.js'
import {createPlatformClient} from './client.js'

// Voice Automation (beta) audio library and provider credentials, contract
// revision voice-audio-v1. The pinned SDK predates `client.voice`, and git
// pins can no longer install newer SDK commits, so this adapter sends the
// documented requests through the organization client's raw transport. The
// SDK keeps credential, retry and error mapping. The types and paths mirror
// `client.voice` in polymorfa/sdks f0f3c0719ce44226aa6af896c33a69c71ef934eb;
// replace this module with that resource once a release that includes it is
// pinned.

export const VOICE_AUDIO_STATUSES = [
  'pending_upload',
  'uploaded',
  'transcoding',
  'ready',
  'failed',
] as const
export type VoiceAudioStatus = (typeof VOICE_AUDIO_STATUSES)[number]

export const VOICE_PROVIDERS = ['elevenlabs', 'openai'] as const
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number]

/** Largest upload the API accepts: 16 MiB. */
export const VOICE_AUDIO_MAX_UPLOAD_BYTES = 16_777_216

export interface VoiceAudioTts {
  readonly provider: string
  readonly voiceId: string
  readonly model: string
  readonly text: string
  readonly characters: number
  readonly keySource: string
  readonly credentialId: string | null
}

export interface VoiceAudioAsset {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly source: string
  readonly status: string
  readonly failureReason: string | null
  readonly originalFormat: string | null
  readonly originalContentType: string | null
  readonly sizeBytes: number | null
  readonly durationMs: number | null
  readonly contentSha256: string | null
  readonly tts: VoiceAudioTts | null
  readonly retentionDays: number | null
  readonly expiresAt: string | null
  readonly inUseCount: number
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly readyAt: string | null
}

/** Where to send the file. The URL is valid for 5 minutes; treat it as a secret. */
export interface VoiceAudioUpload {
  readonly url: string
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly maxBytes: number
  readonly expiresAt: string
}

export interface VoiceAudioUploadCreated {
  readonly asset: VoiceAudioAsset
  readonly upload: VoiceAudioUpload
}

/** A 5-minute link to Opus-in-Ogg audio (16 kHz mono). */
export interface VoiceAudioPreview {
  readonly url: string
  readonly contentType: string
  readonly expiresAt: string
}

export interface VoiceProviderCredential {
  readonly id: string
  readonly projectId: string | null
  readonly provider: string
  readonly label: string
  readonly keyFingerprint: string
  readonly status: string
  readonly verifiedAt: string | null
  readonly lastError: string | null
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface VoiceResourceDeleted {
  readonly id: string
  readonly deleted: true
}

export interface VoiceAudioPage {
  readonly items: readonly VoiceAudioAsset[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface ListVoiceAudioParams {
  readonly projectId: string
  readonly status?: string
  readonly cursor?: string
  readonly limit?: number
}

export interface CreateVoiceAudioUploadInput {
  readonly projectId: string
  readonly name: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly retentionDays?: number
}

export interface SynthesizeVoiceAudioInput {
  readonly projectId: string
  readonly name: string
  readonly text: string
  readonly provider: string
  readonly voiceId: string
  readonly model?: string
  readonly credentialId?: string
  readonly retentionDays?: number
}

export interface UpdateVoiceAudioInput {
  readonly expectedRevision?: number
  readonly name?: string
  readonly retentionDays?: number | null
}

export interface CreateVoiceProviderCredentialInput {
  readonly provider: string
  readonly label: string
  /** Write-only. Never returned, logged or echoed. */
  readonly apiKey: string
  /** A project, or omitted for a credential every project of the team can use. */
  readonly projectId?: string
}

export interface VoiceClient {
  listAudio(params: ListVoiceAudioParams): Promise<ApiResponse<VoiceAudioPage>>
  createAudioUpload(
    input: CreateVoiceAudioUploadInput,
  ): Promise<ApiResponse<VoiceAudioUploadCreated>>
  /** Sends bytes to an upload URL with only its headers and no credential. */
  sendToUploadUrl(
    upload: VoiceAudioUpload,
    body: Uint8Array,
  ): Promise<ResponseMetadata>
  completeAudio(assetId: string): Promise<ApiResponse<VoiceAudioAsset>>
  synthesizeAudio(
    input: SynthesizeVoiceAudioInput,
  ): Promise<ApiResponse<VoiceAudioAsset>>
  retrieveAudio(assetId: string): Promise<ApiResponse<VoiceAudioAsset>>
  updateAudio(
    assetId: string,
    input: UpdateVoiceAudioInput,
  ): Promise<ApiResponse<VoiceAudioAsset>>
  deleteAudio(assetId: string): Promise<ApiResponse<VoiceResourceDeleted>>
  previewAudio(assetId: string): Promise<ApiResponse<VoiceAudioPreview>>
  /** Downloads a preview URL without a credential. */
  downloadPreview(
    preview: VoiceAudioPreview,
    maxBytes: number,
  ): Promise<Uint8Array>
  listCredentials(
    projectId?: string,
  ): Promise<ApiResponse<readonly VoiceProviderCredential[]>>
  createCredential(
    input: CreateVoiceProviderCredentialInput,
  ): Promise<ApiResponse<VoiceProviderCredential>>
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

const AUDIO_PATH = '/platform/voice/audio'
const CREDENTIALS_PATH = '/platform/voice/provider-credentials'
const DEFAULT_BASE_URL = 'https://api.polymorfa.com'
const DEFAULT_TRANSFER_TIMEOUT_MS = 120_000

interface DataEnvelope<T> {
  readonly data: T
  readonly page?: {
    readonly nextCursor?: string | null
    readonly hasMore?: boolean
  }
}

export function createVoiceClient(
  environment: ResolvedEnvironment,
  fetchImplementation: typeof fetch = fetch,
): VoiceClient {
  const raw = createPlatformClient(environment).raw
  const baseUrl = environment.baseUrl ?? DEFAULT_BASE_URL
  const transferTimeoutMs = environment.timeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS

  async function data<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      readonly body?: unknown
      readonly query?: Readonly<Record<string, QueryValue>>
    } = {},
  ): Promise<ApiResponse<T>> {
    const response = await raw.request<DataEnvelope<T>>({
      method,
      path,
      ...(options.body === undefined ? {} : {body: options.body}),
      ...(options.query === undefined ? {} : {query: options.query}),
    })
    return {data: envelopeData(response.data), metadata: response.metadata}
  }

  /**
   * Sends one credential-free request and consumes its response inside the
   * same timed section, so a server that sends headers and then stalls on the
   * body still hits the transfer timeout.
   */
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
      // Never include the URL: it is a short-lived capability.
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
      const response = await raw.request<DataEnvelope<VoiceAudioAsset[]>>({
        method: 'GET',
        path: AUDIO_PATH,
        query: {
          projectId: params.projectId,
          ...(params.status === undefined ? {} : {status: params.status}),
          ...(params.cursor === undefined ? {} : {cursor: params.cursor}),
          ...(params.limit === undefined ? {} : {limit: params.limit}),
        },
      })
      const items = envelopeData(response.data)
      if (!Array.isArray(items)) throw malformed()
      const page = response.data.page
      return {
        data: {
          hasMore: page?.hasMore === true,
          items,
          nextCursor:
            typeof page?.nextCursor === 'string' ? page.nextCursor : null,
        },
        metadata: response.metadata,
      }
    },
    createAudioUpload: (input) =>
      data<VoiceAudioUploadCreated>('POST', AUDIO_PATH, {body: input}),
    async sendToUploadUrl(upload, body) {
      const url = capabilityUrl(baseUrl, upload.url, 'upload')
      const headers = new Headers()
      for (const [name, value] of Object.entries(upload.headers)) {
        if (name.toLowerCase() === 'authorization') continue
        headers.set(name, value)
      }
      return transfer(
        url,
        {
          body: body as unknown as BodyInit,
          headers,
          method: upload.method === 'PUT' ? 'PUT' : 'POST',
        },
        'upload',
        async (response, signal) => {
          if (!response.ok) {
            throw transferError(
              response,
              await safeBody(response, signal),
              'upload',
            )
          }
          await discardBody(response)
          return transferMetadata(response)
        },
      )
    },
    completeAudio: (assetId) =>
      data<VoiceAudioAsset>('POST', `${assetPath(assetId)}/complete`),
    synthesizeAudio: (input) =>
      data<VoiceAudioAsset>('POST', `${AUDIO_PATH}/tts`, {body: input}),
    retrieveAudio: (assetId) =>
      data<VoiceAudioAsset>('GET', assetPath(assetId)),
    updateAudio: (assetId, input) =>
      data<VoiceAudioAsset>('PATCH', assetPath(assetId), {body: input}),
    deleteAudio: (assetId) =>
      data<VoiceResourceDeleted>('DELETE', assetPath(assetId)),
    previewAudio: (assetId) =>
      data<VoiceAudioPreview>('GET', `${assetPath(assetId)}/preview`),
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
          // Content-Length can be missing, understated or describe a
          // compressed body, so the limit is enforced on the bytes read.
          const bytes = await readBody(response, signal, maxBytes)
          if (bytes === undefined) throw tooLargePreview(maxBytes)
          return bytes
        },
      )
    },
    listCredentials: (projectId) =>
      data<readonly VoiceProviderCredential[]>('GET', CREDENTIALS_PATH, {
        query: projectId === undefined ? {} : {projectId},
      }),
    createCredential: (input) =>
      data<VoiceProviderCredential>('POST', CREDENTIALS_PATH, {body: input}),
    retrieveCredential: (credentialId) =>
      data<VoiceProviderCredential>('GET', credentialPath(credentialId)),
    verifyCredential: (credentialId) =>
      data<VoiceProviderCredential>(
        'POST',
        `${credentialPath(credentialId)}/verify`,
      ),
    deleteCredential: (credentialId) =>
      data<VoiceResourceDeleted>('DELETE', credentialPath(credentialId)),
  }
}

function assetPath(assetId: string): string {
  return `${AUDIO_PATH}/${encodeURIComponent(assetId)}`
}

function credentialPath(credentialId: string): string {
  return `${CREDENTIALS_PATH}/${encodeURIComponent(credentialId)}`
}

function envelopeData<T>(envelope: DataEnvelope<T>): T {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    !('data' in envelope)
  ) {
    throw malformed()
  }
  return envelope.data
}

function malformed(): PolymorfaServerError {
  return new PolymorfaServerError(
    'The API returned a voice response without data.',
    {code: 'invalid_response'},
  )
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

function transferMetadata(response: Response): ResponseMetadata {
  const requestId = response.headers.get('x-request-id') ?? undefined
  return {
    attempts: 1,
    headers: {},
    status: response.status,
    ...(requestId === undefined ? {} : {requestId}),
  }
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
