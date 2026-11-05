import {
  type MessagingClient,
  PolymorfaValidationError,
  type VoipCreatedCallLink,
  type VoipPreviewedCallLink,
} from '@polymorfa/sdk'

import {type CallsResult, result, validateSession, yesNo} from './calls.js'

// A pasted link may sit in share text and carry a query or fragment; only its
// path names the media type and token.
const LINK_PATTERN =
  /https:\/\/call\.whatsapp\.com\/(voice|video)\/([A-Za-z0-9_-]{8,256})(?=$|[/?#\s.,;:!)"'>\]])/gi
// Bare tokens are much longer; a short word is a paste mistake, not a token.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,256}$/

export interface ParsedCallLink {
  readonly token: string
  /** Set when the input was a full link, whose path names the media type. */
  readonly video?: boolean
}

/** Accept one WhatsApp call link, possibly inside share text, or its token. */
export function parseCallLink(input: string): ParsedCallLink {
  const value = input.trim()
  const links = new Map<string, ParsedCallLink>()
  for (const [, kind, token] of value.matchAll(LINK_PATTERN))
    links.set(`${kind!.toLowerCase()}/${token!}`, {
      token: token!,
      video: kind!.toLowerCase() === 'video',
    })
  if (links.size === 1) return [...links.values()][0]!
  if (links.size > 1)
    throw new PolymorfaValidationError(
      'Standard input contains more than one call link; pipe exactly one.',
    )
  if (TOKEN_PATTERN.test(value)) return {token: value}
  throw new PolymorfaValidationError(
    'Standard input must contain one https://call.whatsapp.com/voice/… or /video/… link, or its token.',
  )
}

export async function createCallLink(
  client: MessagingClient,
  input: {readonly session: string; readonly video?: boolean},
): Promise<CallsResult<VoipCreatedCallLink>> {
  const response = await client.voip.createCallLink({
    session: validateSession(input.session),
    video: input.video === true,
  })
  return result(response.data.data, response.metadata)
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
      `The link is a ${link.video ? 'video' : 'voice'} link; remove --video or pipe the matching link.`,
    )
  }
  const response = await client.voip.previewCallLink({
    session: validateSession(input.session),
    token: link.token,
    video: link.video ?? input.video === true,
  })
  return result(response.data.data, response.metadata)
}

export function renderCreatedCallLink(link: VoipCreatedCallLink): string {
  return [
    `Link\t${link.url}`,
    `Session\t${link.session}`,
    `Video\t${yesNo(link.video)}`,
    'Anyone with this link can use it in WhatsApp. Keep it private. Creating it did not place or join a call.',
  ].join('\n')
}

export function renderPreviewedCallLink(link: VoipPreviewedCallLink): string {
  const creator =
    link.creator.phoneNumber ?? link.creator.username ?? link.creator.id
  return [
    `Session\t${link.session}`,
    `Video\t${yesNo(link.video)}`,
    `Creator\t${creator}`,
    `Approval required\t${yesNo(link.approvalRequired)}`,
    `Number is link admin\t${yesNo(link.isAdmin)}`,
  ].join('\n')
}
