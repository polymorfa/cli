import {createHmac, randomBytes} from 'node:crypto'
import {lookup} from 'node:dns/promises'
import {request as requestHttp} from 'node:http'
import {request as requestHttps} from 'node:https'
import {BlockList, isIP} from 'node:net'

const NON_PUBLIC_IPV4 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_IPV4.addSubnet(network, prefix, 'ipv4')
}

const NON_PUBLIC_IPV6 = new BlockList()
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_IPV6.addSubnet(network, prefix, 'ipv6')
}

export interface ForwardEventInput {
  readonly body: Uint8Array
  readonly eventId: string
  readonly eventType: string
  readonly secret: string
  readonly targets: readonly string[]
  readonly allowRemote?: boolean
  readonly followRedirects?: boolean
  readonly headers?: Readonly<Record<string, string>>
  readonly skipVerify?: boolean
  readonly signal?: AbortSignal
}

export class ForwardingError extends Error {
  readonly code = 'forwarding_failed'

  constructor(message: string) {
    super(message)
    this.name = 'ForwardingError'
  }
}

export function createForwardingSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function signLocalPayload(
  secret: string,
  timestamp: number,
  body: Uint8Array,
): string {
  const key = Buffer.from(secret, 'base64url')
  if (key.byteLength !== 32)
    throw new ForwardingError('The local forwarding secret is invalid.')
  const digest = createHmac('sha256', key)
    .update(String(timestamp))
    .update('.')
    .update(body)
    .digest('hex')
  return `t=${timestamp},v1=${digest}`
}

export type DestinationResolver = (
  hostname: string,
) => Promise<Array<{address: string; family: 4 | 6}>>

export async function validateForwardDestination(
  value: string,
  allowRemote: boolean,
  resolveHost: DestinationResolver = resolve,
): Promise<{address: string; family: 4 | 6; loopback: boolean; url: URL}> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ForwardingError('A forwarding destination is not a valid URL.')
  }
  if (url.username || url.password) {
    throw new ForwardingError(
      'Forwarding destinations must not contain userinfo.',
    )
  }
  if (url.hash)
    throw new ForwardingError(
      'Forwarding destinations must not contain fragments.',
    )
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ForwardingError('Forwarding destinations must use HTTP or HTTPS.')
  }

  const addresses = await resolveHost(hostname(url))
  const allLoopback = addresses.every(({address}) => isLoopback(address))
  if (!allLoopback && !allowRemote) {
    throw new ForwardingError(
      'Remote forwarding requires --allow-remote-forward.',
    )
  }
  if (!allLoopback && url.protocol !== 'https:') {
    throw new ForwardingError('Remote forwarding destinations must use HTTPS.')
  }
  if (!allLoopback && addresses.some(({address}) => !isPublic(address))) {
    throw new ForwardingError(
      'Remote forwarding resolved to a private or reserved address.',
    )
  }
  if (addresses.some(({address}) => isLoopback(address)) && !allLoopback) {
    throw new ForwardingError(
      'Forwarding destinations must not mix public and private addresses.',
    )
  }
  const selected = addresses[0]
  if (!selected)
    throw new ForwardingError('The forwarding destination has no address.')
  return {
    address: selected.address,
    family: selected.family,
    loopback: allLoopback,
    url,
  }
}

const RESERVED_FORWARD_HEADERS = new Set([
  'accept',
  'authorization',
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export function parseForwardHeaders(
  values: readonly string[],
): Record<string, string> {
  const headers = Object.create(null) as Record<string, string>
  for (const value of values) {
    const separator = value.indexOf(':')
    const name = value.slice(0, separator).trim()
    const rawValue = value.slice(separator + 1)
    const headerValue = rawValue.trim()
    if (
      separator < 1 ||
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      [...rawValue].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127 || code > 255
      }) ||
      RESERVED_FORWARD_HEADERS.has(name.toLowerCase()) ||
      name.toLowerCase().startsWith('polymorfa-')
    ) {
      throw new ForwardingError('A forwarding header is invalid or reserved.')
    }
    const key = name.toLowerCase()
    if (Object.hasOwn(headers, key))
      throw new ForwardingError('A forwarding header was repeated.')
    headers[key] = headerValue
  }
  return headers
}

export async function forwardEvent(input: ForwardEventInput): Promise<void> {
  if (input.targets.length === 0 || input.targets.length > 8) {
    throw new ForwardingError(
      'Forwarding requires between one and eight destinations.',
    )
  }
  await Promise.all(input.targets.map((target) => forwardTarget(target, input)))
}

async function forwardTarget(
  initial: string,
  input: ForwardEventInput,
): Promise<void> {
  let target = initial
  let redirects = 0
  let lastFailure = 'The forwarding destination did not accept the event.'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const destination = await validateForwardDestination(
      target,
      input.allowRemote ?? false,
    )
    if (input.skipVerify && !destination.loopback) {
      throw new ForwardingError(
        '--skip-verify requires a loopback forwarding destination.',
      )
    }
    const timestamp = Math.floor(Date.now() / 1000)
    let response: ResponseSummary
    try {
      response = await send(destination, input, timestamp)
    } catch (error) {
      if (input.signal?.aborted) throw error
      lastFailure = 'The forwarding destination could not be reached.'
      if (attempt < 2) await delayForRetry(retryDelay(attempt), input.signal)
      continue
    }

    if (response.status >= 200 && response.status <= 299) return
    if (response.status >= 300 && response.status <= 399) {
      if (!input.followRedirects) {
        throw new ForwardingError(
          'The forwarding destination returned a redirect.',
        )
      }
      if (response.status !== 307 && response.status !== 308) {
        throw new ForwardingError(
          'Only 307 and 308 forwarding redirects are allowed.',
        )
      }
      if (!response.location || redirects >= 3) {
        throw new ForwardingError('The forwarding redirect limit was exceeded.')
      }
      target = new URL(response.location, destination.url).toString()
      if (
        input.headers &&
        Object.keys(input.headers).length > 0 &&
        new URL(target).origin !== destination.url.origin
      ) {
        throw new ForwardingError(
          'Custom forwarding headers cannot follow a cross-origin redirect.',
        )
      }
      redirects += 1
      attempt -= 1
      continue
    }

    const retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    if (!retryable) {
      throw new ForwardingError(
        `The forwarding destination returned HTTP ${response.status}.`,
      )
    }
    lastFailure = `The forwarding destination returned HTTP ${response.status}.`
    if (attempt < 2) {
      const computed = retryDelay(attempt)
      const retryAfter = parseRetryAfter(response.retryAfter)
      await delayForRetry(
        Math.min(30_000, Math.max(computed, retryAfter ?? 0)),
        input.signal,
      )
    }
  }
  throw new ForwardingError(lastFailure)
}

interface ResolvedDestination {
  readonly address: string
  readonly family: 4 | 6
  readonly loopback: boolean
  readonly url: URL
}

interface ResponseSummary {
  readonly status: number
  readonly location?: string
  readonly retryAfter?: string
}

function send(
  destination: ResolvedDestination,
  input: ForwardEventInput,
  timestamp: number,
): Promise<ResponseSummary> {
  return new Promise((resolve, reject) => {
    const client =
      destination.url.protocol === 'https:' ? requestHttps : requestHttp
    const request = client(
      {
        family: destination.family,
        headers: {
          ...input.headers,
          Accept: '*/*',
          'Content-Length': input.body.byteLength,
          'Content-Type': 'application/json',
          Host: destination.url.host,
          'Polymorfa-Local-Event-Id': input.eventId,
          'Polymorfa-Local-Event-Type': input.eventType,
          'Polymorfa-Local-Signature': signLocalPayload(
            input.secret,
            timestamp,
            input.body,
          ),
        },
        hostname: destination.address,
        method: 'POST',
        path: `${destination.url.pathname}${destination.url.search}`,
        port: destination.url.port || undefined,
        rejectUnauthorized: !(input.skipVerify && destination.loopback),
        servername: hostname(destination.url),
        signal: input.signal,
        timeout: 10_000,
      },
      (response) => {
        response.once('aborted', () => {
          reject(new Error('forward response aborted'))
        })
        response.once('error', reject)
        response.resume()
        response.once('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            ...(typeof response.headers.location === 'string'
              ? {location: response.headers.location}
              : {}),
            ...(typeof response.headers['retry-after'] === 'string'
              ? {retryAfter: response.headers['retry-after']}
              : {}),
          })
        })
      },
    )
    request.once('timeout', () => request.destroy(new Error('forward timeout')))
    request.once('error', reject)
    request.end(input.body)
  })
}

async function resolve(
  hostname: string,
): Promise<Array<{address: string; family: 4 | 6}>> {
  if (isIP(hostname))
    return [{address: hostname, family: isIP(hostname) as 4 | 6}]
  let values: Array<{address: string; family: number}>
  try {
    values = await lookup(hostname, {all: true, verbatim: true})
  } catch {
    throw new ForwardingError(
      'The forwarding destination could not be resolved.',
    )
  }
  return values.map(({address, family}) => ({address, family: family as 4 | 6}))
}

function isLoopback(address: string): boolean {
  if (address === '::1') return true
  const mapped = mappedIpv4(address)
  if (mapped) return mapped.startsWith('127.')
  const bytes = ipv4(address)
  return bytes?.[0] === 127
}

function isPublic(address: string): boolean {
  const mapped = mappedIpv4(address)
  if (mapped) return !NON_PUBLIC_IPV4.check(mapped, 'ipv4')
  const bytes = ipv4(address)
  if (bytes) return !NON_PUBLIC_IPV4.check(address, 'ipv4')
  return isIP(address) === 6 && !NON_PUBLIC_IPV6.check(address, 'ipv6')
}

function ipv4(address: string): number[] | undefined {
  if (isIP(address) !== 4) return undefined
  return address.split('.').map(Number)
}

function mappedIpv4(address: string): string | undefined {
  const normalized = address.toLowerCase()
  if (!normalized.startsWith('::ffff:')) return undefined
  const tail = normalized.slice('::ffff:'.length)
  if (isIP(tail) === 4) return tail
  const halves = tail.split(':')
  if (halves.length !== 2) return undefined
  const high = Number.parseInt(halves[0] ?? '', 16)
  const low = Number.parseInt(halves[1] ?? '', 16)
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return undefined
  }
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
}

function hostname(url: URL): string {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
}

function retryDelay(attempt: number): number {
  const base = attempt === 0 ? 250 : 1000
  return Math.round(base * (1 + Math.random() * 0.2))
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

export function delayForRetry(
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal))

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(
        signal ? abortReason(signal) : new Error('Forwarding was aborted.'),
      )
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, {once: true})
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Forwarding was aborted.')
}
