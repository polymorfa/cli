import {readFile, stat} from 'node:fs/promises'
import {basename, extname} from 'node:path'
import {z} from 'zod'
import type {InteractiveMediaSource, CarouselCard} from '@polymorfa/sdk'

import {
  PolymorfaConfigurationError,
  type ListMessageSection,
  type MessageButton,
} from '@polymorfa/sdk'

import {DEFAULT_MAX_MEDIA_BYTES} from './media.js'

export {DEFAULT_MAX_MEDIA_BYTES}

export interface MediaSourceInput {
  readonly caption?: string | undefined
  readonly file?: string | undefined
  readonly maxBytes?: number | undefined
  readonly mimeType?: string | undefined
  readonly url?: string | undefined
}

export interface MediaSource {
  readonly base64?: string
  readonly caption?: string
  readonly filename?: string
  readonly mimeType?: string
  readonly url?: string
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.3gp': 'video/3gpp',
  '.aac': 'audio/aac',
  '.amr': 'audio/amr',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

/** Guess a MIME type from a file name; the API accepts omission. */
export function mimeTypeFor(path: string): string | undefined {
  return MIME_TYPES[extname(path).toLowerCase()]
}

/**
 * Resolve `--file` or `--url` into inline media content. Local files are sent
 * as base64 in the send request, which is how the SDK uploads Messaging media.
 */
export async function mediaSource(
  input: MediaSourceInput,
): Promise<MediaSource> {
  if ((input.file === undefined) === (input.url === undefined)) {
    throw new PolymorfaConfigurationError(
      'Specify exactly one of --file or --url.',
      'media',
    )
  }

  const shared = {
    ...(input.caption === undefined ? {} : {caption: input.caption}),
  }

  if (input.url !== undefined) {
    let parsed: URL
    try {
      parsed = new URL(input.url)
    } catch {
      throw new PolymorfaConfigurationError(
        'Media --url must be an absolute http or https URL.',
        'url',
      )
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new PolymorfaConfigurationError(
        'Media --url must be an absolute http or https URL.',
        'url',
      )
    }
    return {
      url: input.url,
      ...shared,
      ...(input.mimeType === undefined ? {} : {mimeType: input.mimeType}),
    }
  }

  const path = input.file as string
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_MEDIA_BYTES
  let size: number
  try {
    const details = await stat(path)
    if (!details.isFile()) throw new Error('not a file')
    size = details.size
  } catch {
    throw new PolymorfaConfigurationError(
      `Could not read media file: ${path}`,
      'file',
    )
  }
  if (size === 0) {
    throw new PolymorfaConfigurationError(
      `Media file ${path} is empty.`,
      'file',
    )
  }
  if (size > maxBytes) {
    throw new PolymorfaConfigurationError(
      `Media file ${path} is ${size} bytes and exceeds the ${maxBytes} byte limit. Use --url for large media or raise --max-bytes.`,
      'max-bytes',
    )
  }

  const bytes = await readFile(path)
  const mimeType = input.mimeType ?? mimeTypeFor(path)
  return {
    base64: bytes.toString('base64'),
    filename: basename(path),
    ...shared,
    ...(mimeType === undefined ? {} : {mimeType}),
  }
}

/**
 * Parse `--button` values:
 *   reply:<id>=<text>, url:<text>=<url>, call:<text>=<phone>, copy:<text>=<code>, catalog:<text>=<+E.164>[|<product-id>]
 */
export function parseButton(value: string): MessageButton {
  const colon = value.indexOf(':')
  const type = colon < 0 ? '' : value.slice(0, colon)
  const rest = colon < 0 ? '' : value.slice(colon + 1)
  const equals = rest.indexOf('=')
  const left = equals < 0 ? '' : rest.slice(0, equals).trim()
  const right = equals < 0 ? '' : rest.slice(equals + 1).trim()

  if (left.length === 0 || right.length === 0) throw invalidButton(value)

  switch (type) {
    case 'reply':
      return {type: 'reply', id: left, text: right}
    case 'url':
      return {type: 'url', text: left, url: right}
    case 'call':
      if (!/^\+[1-9]\d{1,14}$/.test(right)) throw invalidButton(value)
      return {type: 'call', text: left, phoneNumber: right}
    case 'catalog': {
      const [businessPhoneNumber, catalogProductId, extra] = right.split('|')
      if (
        businessPhoneNumber === undefined ||
        !/^\+[1-9]\d{1,14}$/.test(businessPhoneNumber) ||
        extra !== undefined ||
        (catalogProductId !== undefined && !/^[1-9]\d*$/.test(catalogProductId))
      )
        throw invalidButton(value)
      return {
        type: 'catalog',
        text: left,
        businessPhoneNumber,
        ...(catalogProductId === undefined ? {} : {catalogProductId}),
      }
    }
    case 'copy':
      return {type: 'copy', text: left, copyCode: right}
    default:
      throw invalidButton(value)
  }
}

function invalidButton(value: string): PolymorfaConfigurationError {
  return new PolymorfaConfigurationError(
    `Invalid --button "${value}". Use reply:<id>=<text>, url:<text>=<url>, call:<text>=<+E.164>, copy:<text>=<code>, or catalog:<text>=<+E.164>[|<product-id>].`,
    'button',
  )
}

/**
 * Parse `--row` values into list sections. A row is `<id>=<title>` with an
 * optional `|<description>`, and may be prefixed by `<section>/` to group it.
 */
export function parseListRows(values: readonly string[]): ListMessageSection[] {
  const sections = new Map<
    string,
    {id: string; title: string; description?: string}[]
  >()
  for (const value of values) {
    const slash = value.indexOf('/')
    const equals = value.indexOf('=')
    const hasSection = slash > 0 && (equals < 0 || slash < equals)
    const section = hasSection ? value.slice(0, slash).trim() : ''
    const row = hasSection ? value.slice(slash + 1) : value
    const rowEquals = row.indexOf('=')
    const id = rowEquals < 0 ? '' : row.slice(0, rowEquals).trim()
    const text = rowEquals < 0 ? '' : row.slice(rowEquals + 1)
    const pipe = text.indexOf('|')
    const title = (pipe < 0 ? text : text.slice(0, pipe)).trim()
    const description = pipe < 0 ? undefined : text.slice(pipe + 1).trim()
    if (id.length === 0 || title.length === 0) {
      throw new PolymorfaConfigurationError(
        `Invalid --row "${value}". Use [<section>/]<id>=<title>[|<description>].`,
        'row',
      )
    }
    const rows = sections.get(section) ?? []
    rows.push({
      id,
      title,
      ...(description === undefined || description.length === 0
        ? {}
        : {description}),
    })
    sections.set(section, rows)
  }
  return [...sections.entries()].map(([title, rows]) => ({
    ...(title.length === 0 ? {} : {title}),
    rows,
  }))
}

export function parseCoordinate(value: string, name: 'lat' | 'long'): number {
  const limit = name === 'lat' ? 90 : 180
  const parsed = Number(value)
  if (
    value.trim().length === 0 ||
    !Number.isFinite(parsed) ||
    Math.abs(parsed) > limit
  ) {
    throw new PolymorfaConfigurationError(
      `--${name} must be a number between -${limit} and ${limit}.`,
      name,
    )
  }
  return parsed
}

/** Build a minimal vCard 3.0 for one contact. */
export function buildVcard(input: {
  readonly name: string
  readonly phones: readonly string[]
  readonly organization?: string | undefined
}): string {
  const name = input.name.trim()
  if (name.length === 0) {
    throw new PolymorfaConfigurationError(
      'Contact --name cannot be empty.',
      'name',
    )
  }
  if (input.phones.length === 0) {
    throw new PolymorfaConfigurationError(
      'Pass at least one --phone for the contact.',
      'phone',
    )
  }
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(name)}`]
  if (input.organization !== undefined) {
    lines.push(`ORG:${escapeVcard(input.organization)}`)
  }
  for (const phone of input.phones) {
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      throw new PolymorfaConfigurationError(
        `Contact phone ${phone} must be an E.164 number such as +15551234567.`,
        'phone',
      )
    }
    lines.push(`TEL;type=CELL;waid=${phone.slice(1)}:${phone}`)
  }
  lines.push('END:VCARD')
  return lines.join('\n')
}

function escapeVcard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/** Linked format limits, checked before credential resolution or HTTP work. */
export function validateLinkedButtons(
  buttons: readonly MessageButton[],
  allowMixed: boolean,
): void {
  const replies = buttons.filter((button) => button.type === 'reply')
  const ctas = buttons.length - replies.length
  if (
    buttons.length < 1 ||
    buttons.length > 10 ||
    ctas > 3 ||
    (replies.length > 0 &&
      ctas > 0 &&
      (!allowMixed ||
        buttons.some(
          (button) => button.type === 'copy' || button.type === 'catalog',
        )))
  )
    throw new PolymorfaConfigurationError(
      'Use up to ten total buttons and three CTAs. Replies can mix with URL/call; carousel cards use replies or CTAs.',
      'button',
    )
  const ids = new Set<string>()
  for (const button of buttons) {
    if (!button.text.trim() || Buffer.byteLength(button.text, 'utf8') > 256)
      throw new PolymorfaConfigurationError(
        'Button labels must contain 1–256 UTF-8 bytes.',
        'button',
      )
    if (button.type === 'reply') {
      if (
        !button.id.trim() ||
        Buffer.byteLength(button.id, 'utf8') > 256 ||
        /\p{Cc}/u.test(button.id) ||
        ids.has(button.id)
      )
        throw new PolymorfaConfigurationError(
          'Reply IDs must be unique nonempty strings of at most 256 UTF-8 bytes.',
          'button',
        )
      ids.add(button.id)
    }
  }
}

const jsonButton = z.discriminatedUnion('type', [
  z
    .object({type: z.literal('reply'), text: z.string(), id: z.string()})
    .strict(),
  z
    .object({
      type: z.literal('url'),
      text: z.string(),
      url: z.string().url().max(2048).startsWith('https://'),
    })
    .strict(),
  z
    .object({
      type: z.literal('call'),
      text: z.string(),
      phoneNumber: z.string().regex(/^\+?\d{6,20}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('copy'),
      text: z.string(),
      copyCode: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      type: z.literal('catalog'),
      text: z.string(),
      businessPhoneNumber: z.string().regex(/^\+?\d{6,20}$/),
      catalogProductId: z.string().max(256).optional(),
    })
    .strict(),
])
const mediaJson = z.object({
  url: z.string().url().optional(),
  base64: z
    .string()
    .min(1)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .optional(),
  mimeType: z.string().max(256).optional(),
})
const oneSource = (value: {
  url?: string | undefined
  base64?: string | undefined
}) => (value.url === undefined) !== (value.base64 === undefined)
const cardJson = z.object({
  body: z
    .string()
    .min(1)
    .refine((s) => Buffer.byteLength(s, 'utf8') <= 4096),
  footer: z
    .string()
    .refine((s) => Buffer.byteLength(s, 'utf8') <= 256)
    .optional(),
  buttons: z.array(jsonButton).min(1).max(10),
})
const carouselCardsJson = z
  .array(
    z.union([
      cardJson.extend({image: mediaJson.strict().refine(oneSource)}).strict(),
      cardJson
        .extend({
          video: mediaJson
            .extend({thumbnail: z.string().max(21848).optional()})
            .strict()
            .refine(oneSource),
        })
        .strict(),
    ]),
  )
  .min(2)
  .max(10)

export function parseCarouselCards(value: unknown): readonly CarouselCard[] {
  const parsed = carouselCardsJson.safeParse(value)
  if (!parsed.success)
    throw new PolymorfaConfigurationError(
      'Carousel --cards must contain 2–10 complete image/video cards with one media source per card.',
      'cards',
    )
  const source = (media: {
    url?: string | undefined
    base64?: string | undefined
    mimeType?: string | undefined
  }): InteractiveMediaSource => {
    const mime = media.mimeType === undefined ? {} : {mimeType: media.mimeType}
    return media.url === undefined
      ? {base64: media.base64!, ...mime}
      : {url: media.url, ...mime}
  }
  const cards: CarouselCard[] = parsed.data.map((card) => {
    const buttons: MessageButton[] = card.buttons.map((button) =>
      button.type === 'catalog'
        ? {
            type: button.type,
            text: button.text,
            businessPhoneNumber: button.businessPhoneNumber,
            ...(button.catalogProductId === undefined
              ? {}
              : {catalogProductId: button.catalogProductId}),
          }
        : button,
    )
    const common = {
      body: card.body,
      buttons,
      ...(card.footer === undefined ? {} : {footer: card.footer}),
    }
    return 'image' in card
      ? {...common, image: source(card.image)}
      : {
          ...common,
          video: {
            ...source(card.video),
            ...(card.video.thumbnail === undefined
              ? {}
              : {thumbnail: card.video.thumbnail}),
          },
        }
  })
  const ids = new Set<string>()
  for (const card of cards) {
    validateLinkedButtons(card.buttons, false)
    for (const button of card.buttons)
      if (button.type === 'reply') {
        if (ids.has(button.id))
          throw new PolymorfaConfigurationError(
            'Carousel reply IDs must be unique across all cards.',
            'cards',
          )
        ids.add(button.id)
      }
  }
  return cards
}
