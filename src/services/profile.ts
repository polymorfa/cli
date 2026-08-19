import {readFile, stat} from 'node:fs/promises'

import {
  PolymorfaConfigurationError,
  type MessagingClient,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
} from '@polymorfa/sdk'

export const MAX_PROFILE_PICTURE_BYTES = 50 * 1024 * 1024

export interface ProfileResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function viewProfile(
  client: MessagingClient,
  session: string,
): Promise<ProfileResult<unknown>> {
  const response = await client.profile.get(session)
  return result(response.data.data as unknown, response.metadata)
}

export async function setProfileName(
  client: MessagingClient,
  session: string,
  name: string,
  options: RequestOptions = {},
): Promise<ProfileResult<SuccessResponse>> {
  if (name.length === 0) {
    throw new PolymorfaConfigurationError(
      'Profile name cannot be empty.',
      'name',
    )
  }

  const response = await client.profile.setName(session, {name}, options)
  return result(response.data, response.metadata)
}

export async function setProfileStatus(
  client: MessagingClient,
  session: string,
  status: string,
  options: RequestOptions = {},
): Promise<ProfileResult<SuccessResponse>> {
  const response = await client.profile.setStatus(session, {status}, options)
  return result(response.data, response.metadata)
}

export async function setProfilePicture(
  client: MessagingClient,
  session: string,
  source: {readonly file?: string; readonly url?: string},
  options: RequestOptions = {},
): Promise<ProfileResult<SuccessResponse>> {
  const request = await pictureRequest(source)
  const response = await client.profile.setPicture(session, request, options)
  return result(response.data, response.metadata)
}

export async function deleteProfilePicture(
  client: MessagingClient,
  session: string,
  options: RequestOptions = {},
): Promise<ProfileResult<SuccessResponse>> {
  const response = await client.profile.deletePicture(session, options)
  return result(response.data, response.metadata)
}

export function renderProfile(data: unknown): string {
  if (!isRecord(data)) return String(data)

  const rows = [
    field('Name', data.name),
    field('Status', data.status),
    field('Push name', data.pushName),
    field('Business name', data.businessName),
    field('Platform', data.platform),
    field('JID', data.jid),
    field('Picture', data.profilePicUrl),
  ].filter((value): value is string => value !== undefined)

  return rows.length === 0
    ? JSON.stringify(data, undefined, 2)
    : rows.join('\n')
}

async function pictureRequest(source: {
  readonly file?: string
  readonly url?: string
}): Promise<{readonly base64?: string; readonly url?: string}> {
  if (source.file === undefined && source.url === undefined) {
    throw new PolymorfaConfigurationError(
      'Provide exactly one of --file or --url.',
      'picture',
    )
  }

  if (source.file !== undefined && source.url !== undefined) {
    throw new PolymorfaConfigurationError(
      '--file cannot also be provided with --url.',
      'picture',
    )
  }

  if (source.url !== undefined) return {url: source.url}

  const size = (await stat(source.file!)).size
  enforcePictureLimit(size, source.file!)
  const bytes = await readFile(source.file!)
  enforcePictureLimit(bytes.byteLength, source.file!)
  return {base64: bytes.toString('base64')}
}

function enforcePictureLimit(size: number, file: string): void {
  if (size <= MAX_PROFILE_PICTURE_BYTES) return
  throw new PolymorfaConfigurationError(
    `${file} is ${size} bytes and exceeds the ${MAX_PROFILE_PICTURE_BYTES} byte profile picture limit.`,
    'file',
  )
}

function field(label: string, value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? `${label}\t${value}`
    : undefined
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function result<T>(data: T, metadata: ResponseMetadata): ProfileResult<T> {
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
