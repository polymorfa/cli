import {readFile, stat} from 'node:fs/promises'
import {resolve} from 'node:path'

import {
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  type MessagingClient,
  type MessagingMediaInfo,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
  type WhatsAppMediaKind,
  type WhatsAppMediaMessage,
} from '@polymorfa/sdk'
import {
  downloadWhatsAppMediaToFile,
  writeStreamToFile,
} from '@polymorfa/sdk/node'

export const DEFAULT_MAX_MEDIA_BYTES = 100 * 1024 * 1024
const MAX_EVENT_FILE_BYTES = 10 * 1024 * 1024

export interface MediaResult<T> {
  readonly data: T
  readonly metadata?: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export interface DownloadedMedia {
  readonly bytes: number
  readonly mediaId: string
  readonly mimeType: string
  readonly path: string
}

export interface DownloadedWhatsAppMedia {
  readonly bytes: number
  readonly fileName?: string
  readonly mediaKind: WhatsAppMediaKind
  readonly mimeType: string
  readonly path: string
}

export interface SignedMediaUrl {
  readonly expiresAt?: string
  readonly mediaId: string
  readonly requestId?: string
  readonly url: string
}

export async function viewMedia(
  client: MessagingClient,
  mediaId: string,
): Promise<MediaResult<MessagingMediaInfo>> {
  const response = await client.media.retrieve(mediaId)
  return result(response.data.data, response.metadata)
}

/**
 * Streams Messaging media into a temporary sibling file and moves it into
 * place after the whole body arrives. Storage redirects are followed without
 * sending the credential to the storage host.
 */
export async function downloadMedia(
  client: MessagingClient,
  mediaId: string,
  options: {
    readonly force: boolean
    readonly maxBytes: number
    readonly output: string
  },
): Promise<MediaResult<DownloadedMedia>> {
  const output = resolve(options.output)
  if (!options.force) await rejectExistingOutput(output)

  const info = await client.media.retrieve(mediaId)
  enforceLimit(info.data.data.fileLength, options.maxBytes, mediaId)

  const download = await client.media.downloadStream(mediaId)
  if (download.contentLength !== undefined) {
    try {
      enforceLimit(download.contentLength, options.maxBytes, mediaId)
    } catch (error) {
      await download.body.cancel().catch(() => {})
      throw error
    }
  }

  const written = await writeStreamToFile(download.body, output, {
    maxBytes: options.maxBytes,
    overwrite: options.force,
  }).catch((error: unknown) => {
    throw mapWriteError(error, output, mediaId, options.maxBytes)
  })

  return result(
    {
      bytes: written.bytes,
      mediaId,
      mimeType: info.data.data.mimeType,
      path: output,
    },
    download.metadata,
  )
}

/** Returns the short-lived signed storage URL without downloading the media. */
export async function signedMediaUrl(
  client: MessagingClient,
  mediaId: string,
): Promise<MediaResult<SignedMediaUrl>> {
  const target = await client.media.downloadUrl(mediaId)
  if (target.streamed) {
    throw new PolymorfaConfigurationError(
      `The API streams media ${mediaId} directly and issued no signed link. Use --output to download it.`,
      'url',
    )
  }

  return {
    data: {
      mediaId,
      url: target.url,
      ...(target.requestId === undefined ? {} : {requestId: target.requestId}),
      ...(target.expiresAt === undefined
        ? {}
        : {expiresAt: target.expiresAt.toISOString()}),
    },
  }
}

/**
 * Decrypts media straight from the WhatsApp CDN using a stored message
 * webhook. No Polymorfa credential is used or sent.
 */
export async function downloadMediaFromEvent(
  eventFile: string,
  options: {
    readonly force: boolean
    readonly maxBytes: number
    readonly output: string
    readonly timeoutMs?: number
  },
): Promise<MediaResult<DownloadedWhatsAppMedia>> {
  const output = resolve(options.output)
  if (!options.force) await rejectExistingOutput(output)
  const message = await readMediaEvent(eventFile)

  const signal =
    options.timeoutMs === undefined
      ? undefined
      : AbortSignal.timeout(options.timeoutMs)
  const written = await downloadWhatsAppMediaToFile(message, output, {
    maxBytes: options.maxBytes,
    overwrite: options.force,
    ...(signal === undefined ? {} : {signal}),
  }).catch((error: unknown) => {
    if (signal?.aborted === true) {
      throw new PolymorfaTimeoutError(
        `The media download did not finish within ${options.timeoutMs} ms.`,
        {cause: error, code: 'request_timeout'},
      )
    }
    throw mapWriteError(error, output, 'from the event', options.maxBytes)
  })

  return {
    data: {
      bytes: written.bytes,
      mediaKind: written.mediaKind,
      mimeType: written.mimetype,
      path: output,
      ...(written.fileName === undefined ? {} : {fileName: written.fileName}),
    },
  }
}

export async function persistMedia(
  client: MessagingClient,
  mediaId: string,
  options: RequestOptions = {},
): Promise<MediaResult<SuccessResponse>> {
  const response = await client.media.persist(mediaId, options)
  return result(response.data, response.metadata)
}

/**
 * Accepts a full webhook event (`{event, payload}`) or a bare message
 * payload. The file contains a media decryption key, so its contents are
 * never echoed in errors.
 */
export async function readMediaEvent(
  path: string,
): Promise<WhatsAppMediaMessage> {
  const file = resolve(path)
  const stats = await stat(file).catch((error: unknown) => {
    throw eventFileAccessError(file, error)
  })
  if (!stats.isFile() || stats.size > MAX_EVENT_FILE_BYTES) {
    throw new PolymorfaValidationError(
      `${file} must be a regular JSON file no larger than 10 MiB.`,
    )
  }

  const text = await readFile(file, 'utf8').catch((error: unknown) => {
    throw eventFileAccessError(file, error)
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new PolymorfaValidationError(`${file} is not valid JSON.`)
  }

  const payload =
    isRecord(parsed) && isRecord(parsed.payload) ? parsed.payload : parsed
  if (
    !isRecord(payload) ||
    typeof payload.type !== 'string' ||
    typeof payload.media !== 'string'
  ) {
    throw new PolymorfaValidationError(
      `${file} has no message payload with an encrypted media descriptor. Persisted media (mediaUrl) must be downloaded by media ID.`,
    )
  }

  return {media: payload.media, type: payload.type}
}

function eventFileAccessError(
  file: string,
  error: unknown,
): PolymorfaValidationError {
  const code = nodeErrorCode(error)
  return new PolymorfaValidationError(
    `${file} could not be read${code === undefined ? '' : ` (${code})`}. Pass --from-event a readable JSON file.`,
  )
}

async function rejectExistingOutput(output: string): Promise<void> {
  try {
    await stat(output)
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return
    throw error
  }

  throw outputConflict(output)
}

function enforceLimit(size: number, maxBytes: number, mediaId: string): void {
  if (size <= maxBytes) return
  throw new PolymorfaConfigurationError(
    `Media ${mediaId} is ${size} bytes and exceeds the ${maxBytes} byte download limit. Increase --max-bytes to allow larger files.`,
    'max-bytes',
  )
}

function mapWriteError(
  error: unknown,
  output: string,
  mediaId: string,
  maxBytes: number,
): unknown {
  if (error instanceof PolymorfaConflictError) return outputConflict(output)
  if ((error as {code?: unknown} | undefined)?.code === 'media_too_large') {
    const subject =
      mediaId === 'from the event' ? 'The media' : `Media ${mediaId}`
    return new PolymorfaConfigurationError(
      `${subject} exceeds the ${maxBytes} byte download limit. Increase --max-bytes to allow larger files.`,
      'max-bytes',
    )
  }

  return error
}

function outputConflict(output: string): PolymorfaConflictError {
  return new PolymorfaConflictError(
    `Output file ${output} already exists. Pass --force to overwrite it.`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nodeErrorCode(error: unknown): string | undefined {
  return (error as {code?: string} | undefined)?.code
}

function result<T>(data: T, metadata: ResponseMetadata): MediaResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  }
}
