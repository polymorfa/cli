import {Flags} from '@oclif/core'
import type {MessageResponse, SendMediaMessageRequest} from '@polymorfa/sdk'

import {sendContext, type SendContextFlagValues} from '../input/message-send.js'
import {
  DEFAULT_MAX_MEDIA_BYTES,
  mediaSource,
  type MediaSource,
} from '../services/message-content.js'

export type MediaSendKind = 'image' | 'video' | 'audio' | 'document'

export const mediaSourceFlags = {
  file: Flags.string({
    description: 'Local file to upload with the message.',
    exclusive: ['url'],
  }),
  'max-bytes': Flags.integer({
    default: DEFAULT_MAX_MEDIA_BYTES,
    description: 'Reject local files larger than this many bytes.',
    min: 1,
  }),
  'mime-type': Flags.string({
    description: 'MIME type. Inferred from the file extension when omitted.',
  }),
  url: Flags.string({
    description: 'Public http or https URL the API fetches the media from.',
    exclusive: ['file'],
  }),
}

export interface MediaSendFlagValues extends SendContextFlagValues {
  readonly caption?: string | undefined
  readonly file?: string | undefined
  readonly filename?: string | undefined
  readonly 'max-bytes'?: number | undefined
  readonly 'mime-type'?: string | undefined
  readonly url?: string | undefined
  readonly voice?: boolean | undefined
}

export async function mediaSendRequest(
  kind: MediaSendKind,
  flags: MediaSendFlagValues,
): Promise<SendMediaMessageRequest> {
  const source = await mediaSource({
    caption: flags.caption,
    file: flags.file,
    maxBytes: flags['max-bytes'],
    mimeType: flags['mime-type'],
    url: flags.url,
  })
  const context = sendContext(flags)
  const base = mediaBody(source)

  switch (kind) {
    case 'image':
      return {...context, content: {image: base}}
    case 'video':
      return {...context, content: {video: base}}
    case 'audio':
      return {
        ...context,
        content: {
          voice: {...base, ...(flags.voice === true ? {ptt: true} : {})},
        },
      }
    case 'document': {
      const filename = flags.filename ?? source.filename
      return {
        ...context,
        content: {
          file: {...base, ...(filename === undefined ? {} : {filename})},
        },
      }
    }
  }
}

function mediaBody(source: MediaSource):
  | {
      readonly url: string
      readonly mimeType?: string
      readonly caption?: string
    }
  | {
      readonly base64: string
      readonly mimeType?: string
      readonly caption?: string
    } {
  const extra = {
    ...(source.mimeType === undefined ? {} : {mimeType: source.mimeType}),
    ...(source.caption === undefined ? {} : {caption: source.caption}),
  }
  return source.url === undefined
    ? {base64: source.base64 as string, ...extra}
    : {url: source.url, ...extra}
}

export function sentMediaMessage(
  kind: MediaSendKind,
  data: MessageResponse,
  to: string,
): string {
  const media = data.mediaId === undefined ? '' : ` (media ${data.mediaId})`
  return `Sent ${kind} message ${data.id} to ${to}${media}.`
}
