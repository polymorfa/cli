import {
  type MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type VoipCreatedCallLink,
  type VoipPreviewedCallLink,
} from '@polymorfa/sdk'

import type {CallsResult} from './calls.js'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/
const LINK_PATTERN =
  /^https:\/\/call\.whatsapp\.com\/(voice|video)\/([A-Za-z0-9_-]{1,256})\/?$/

export interface ParsedCallLink {
  readonly token: string
  /** Set when the input was a full link, whose path names the media type. */
  readonly video?: boolean
}

/** Accept a full WhatsApp call link or its bare token. */
export function parseCallLink(input: string): ParsedCallLink {
  const value = input.trim()
  const link = LINK_PATTERN.exec(value)
  if (link !== null) return {token: link[2]!, video: link[1] === 'video'}
  if (TOKEN_PATTERN.test(value)) return {token: value}
  throw new PolymorfaValidationError(
    'Standard input must contain one https://call.whatsapp.com/voice/… or /video/… link, or its token.',
  )
}

function session(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new PolymorfaConfigurationError(
      'Session must contain 1 to 128 characters.',
      'session',
    )
  }
  return trimmed
}

export async function createCallLink(
  client: MessagingClient,
  input: {readonly session: string; readonly video?: boolean},
): Promise<CallsResult<VoipCreatedCallLink>> {
  const response = await client.voip.createCallLink({
    session: session(input.session),
    video: input.video === true,
  })
  return {data: response.data.data, metadata: metadata(response.metadata)}
}

export async function previewCallLink(
  client: MessagingClient,
  input: {
    readonly link: ParsedCallLink
    readonly session: string
    readonly video?: boolean
  },
): Promise<CallsResult<VoipPreviewedCallLink>> {
  const {link} = input
  if (
    link.video !== undefined &&
    input.video !== undefined &&
    link.video !== input.video
  ) {
    throw new PolymorfaValidationError(
      `The link is a ${link.video ? 'video' : 'voice'} link; remove --video or pass the matching link.`,
    )
  }
  const response = await client.voip.previewCallLink({
    session: session(input.session),
    token: link.token,
    video: link.video ?? input.video === true,
  })
  return {data: response.data.data, metadata: metadata(response.metadata)}
}

export function renderCreatedCallLink(link: VoipCreatedCallLink): string {
  return [
    `Link\t${link.url}`,
    `Session\t${link.session}`,
    `Video\t${link.video ? 'yes' : 'no'}`,
    'Anyone with this link can use it in WhatsApp. Keep it private. Creating it did not place or join a call.',
  ].join('\n')
}

export function renderPreviewedCallLink(link: VoipPreviewedCallLink): string {
  const creator =
    link.creator.phoneNumber ?? link.creator.username ?? link.creator.id
  return [
    `Session\t${link.session}`,
    `Video\t${link.video ? 'yes' : 'no'}`,
    `Creator\t${creator}`,
    `Approval required\t${link.approvalRequired ? 'yes' : 'no'}`,
    `Number is link admin\t${link.isAdmin ? 'yes' : 'no'}`,
  ].join('\n')
}

function metadata(value: {
  readonly apiVersion?: string
  readonly attempts: number
  readonly requestId?: string
  readonly status: number
}): CallsResult<unknown>['metadata'] {
  return {
    attempts: value.attempts,
    status: value.status,
    ...(value.apiVersion === undefined ? {} : {apiVersion: value.apiVersion}),
    ...(value.requestId === undefined ? {} : {requestId: value.requestId}),
  }
}
