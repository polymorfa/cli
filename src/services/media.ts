import {stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  type MessagingClient,
  type MessagingMediaInfo,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
} from '@polymorfa/sdk'

export const DEFAULT_MAX_MEDIA_BYTES = 100 * 1024 * 1024

export interface MediaResult<T> {
  readonly data: T
  readonly metadata: {
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

export async function viewMedia(
  client: MessagingClient,
  mediaId: string,
): Promise<MediaResult<MessagingMediaInfo>> {
  const response = await client.media.retrieve(mediaId)
  return result(response.data.data, response.metadata)
}

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

  const downloaded = await client.media.download(mediaId)
  enforceLimit(downloaded.data.byteLength, options.maxBytes, mediaId)

  try {
    await writeFile(output, new Uint8Array(downloaded.data), {
      flag: options.force ? 'w' : 'wx',
    })
  } catch (error) {
    if (nodeErrorCode(error) === 'EEXIST') throw outputConflict(output)
    throw error
  }

  return result(
    {
      bytes: downloaded.data.byteLength,
      mediaId,
      mimeType: info.data.data.mimeType,
      path: output,
    },
    downloaded.metadata,
  )
}

export async function persistMedia(
  client: MessagingClient,
  mediaId: string,
  options: RequestOptions = {},
): Promise<MediaResult<SuccessResponse>> {
  const response = await client.media.persist(mediaId, options)
  return result(response.data, response.metadata)
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
    `Media ${mediaId} is ${size} bytes and exceeds the ${maxBytes} byte download limit. Increase --max-bytes only when enough memory is available.`,
    'max-bytes',
  )
}

function outputConflict(output: string): PolymorfaConflictError {
  return new PolymorfaConflictError(
    `Output file ${output} already exists. Pass --force to overwrite it.`,
  )
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
