import {
  PolymorfaConfigurationError,
  PolymorfaServerError,
  PolymorfaValidationError,
  type Client as PlatformClient,
  type CreateSipTrunkInput,
  type ResponseMetadata,
  type SipTrunk,
  type SipTrunkCreated,
  type SipTrunkCredentials,
  type SipTrunkDeleted,
} from '@polymorfa/sdk'

export interface SipTrunkResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export function requireSipTrunkProject(projectId?: string): string {
  if (projectId === undefined || projectId.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Provide --project with the project ID that owns the SIP trunks.',
      'project',
    )
  }
  return projectId.trim()
}

export async function listSipTrunks(
  client: PlatformClient,
  projectId: string,
): Promise<SipTrunkResult<readonly SipTrunk[]>> {
  const response = await client.sipTrunks.list(projectId)
  return result(response.data, response.metadata)
}

export async function viewSipTrunk(
  client: PlatformClient,
  trunkId: string,
): Promise<SipTrunkResult<SipTrunk>> {
  const response = await client.sipTrunks.retrieve(validateTrunkId(trunkId))
  return result(response.data, response.metadata)
}

export async function createSipTrunk(
  client: PlatformClient,
  projectId: string,
  input: unknown,
): Promise<SipTrunkResult<SipTrunkCreated>> {
  const body = objectInput(input, 'SIP trunk')
  if ('projectId' in body) {
    throw new PolymorfaValidationError(
      'SIP trunk input must not contain projectId; use --project.',
      {code: 'invalid_sip_trunk_input'},
    )
  }
  if (typeof body.name !== 'string' || typeof body.direction !== 'string') {
    throw new PolymorfaValidationError(
      'SIP trunk input must contain name and direction.',
      {code: 'invalid_sip_trunk_input'},
    )
  }
  const response = await client.sipTrunks.create(
    projectId,
    body as unknown as CreateSipTrunkInput,
  )
  return result(response.data, response.metadata)
}

export interface SipTrunkUpdateFlags {
  readonly enabled?: boolean
  readonly expectedRevision?: number
}

export async function updateSipTrunk(
  client: PlatformClient,
  trunkId: string,
  input: unknown,
  flags: SipTrunkUpdateFlags,
): Promise<SipTrunkResult<SipTrunk>> {
  const body = input === undefined ? {} : objectInput(input, 'SIP trunk update')
  const merged: Record<string, unknown> = {
    ...body,
    ...(flags.enabled === undefined ? {} : {enabled: flags.enabled}),
    ...(flags.expectedRevision === undefined
      ? {}
      : {expectedRevision: flags.expectedRevision}),
  }
  if (Object.keys(merged).every((key) => key === 'expectedRevision')) {
    throw new PolymorfaConfigurationError(
      'Provide --input, --enable, or --disable with the change to make.',
      'input',
    )
  }
  const response = await client.sipTrunks.update(
    validateTrunkId(trunkId),
    merged,
  )
  return result(response.data, response.metadata)
}

export async function deleteSipTrunk(
  client: PlatformClient,
  trunkId: string,
): Promise<SipTrunkResult<SipTrunkDeleted>> {
  const response = await client.sipTrunks.delete(validateTrunkId(trunkId))
  return result(response.data, response.metadata)
}

export async function rotateSipTrunkCredentials(
  client: PlatformClient,
  trunkId: string,
): Promise<SipTrunkResult<SipTrunkCredentials>> {
  const response = await client.sipTrunks.rotateCredentials(
    validateTrunkId(trunkId),
  )
  return result(response.data, response.metadata)
}

export type SipEndpointTransportName = 'udp' | 'tcp' | 'tls'

export interface SipEndpointTransport {
  readonly transport: SipEndpointTransportName
  readonly port: number
  readonly srtp: 'required' | 'not_supported'
}

/**
 * The SIP address of the environment, from `GET /platform/sip/endpoint`.
 * `sip_not_hosted` is a normal answer: the environment has no SIP address,
 * `host` and `rtp` are null and `transports` is empty.
 */
export interface SipEndpoint {
  readonly status: 'hosted' | 'sip_not_hosted'
  readonly host: string | null
  readonly transports: readonly SipEndpointTransport[]
  readonly rtp: {
    readonly protocol: 'udp'
    readonly portMin: number
    readonly portMax: number
  } | null
}

/**
 * The pinned SDK has no `sipTrunks.endpoint()` yet, so this reads the
 * operation through the SDK's raw client (same transport, credential, retries
 * and error mapping) and checks the envelope here. Switch to
 * `client.sipTrunks.endpoint()` once the SDK release that adds it is pinned.
 */
export async function getSipEndpoint(
  client: PlatformClient,
): Promise<SipTrunkResult<SipEndpoint>> {
  const response = await client.raw.request({
    method: 'GET',
    path: '/platform/sip/endpoint',
  })
  return result(
    decodeSipEndpoint(response.data, response.metadata),
    response.metadata,
  )
}

/**
 * The SIP address to print next to new inbound credentials. A failure here
 * must never hide a password that can be shown only once, so it yields
 * undefined instead of throwing.
 */
export async function trySipEndpoint(
  client: PlatformClient,
): Promise<SipEndpoint | undefined> {
  try {
    return (await getSipEndpoint(client)).data
  } catch {
    return undefined
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

export function renderSipTrunks(trunks: readonly SipTrunk[]): string {
  if (trunks.length === 0) return 'No SIP trunks found.'
  return trunks
    .map((trunk) =>
      [
        trunk.id,
        trunk.name,
        trunk.direction,
        trunk.enabled ? 'enabled' : 'disabled',
        trunk.outbound?.targetUri ?? '-',
      ].join('\t'),
    )
    .join('\n')
}

export function renderSipTrunk(trunk: SipTrunk): string {
  const lines = [
    `Trunk\t${trunk.id}`,
    `Name\t${trunk.name}`,
    `Project\t${trunk.projectId}`,
    `Direction\t${trunk.direction}`,
    `Enabled\t${yesNo(trunk.enabled)}`,
    `Codecs\t${trunk.codecs.join(', ')}`,
    `Max calls\t${trunk.maxConcurrentCalls}`,
    `Revision\t${trunk.revision}`,
  ]
  if (trunk.outbound !== null) {
    lines.push(
      `Target URI\t${trunk.outbound.targetUri}`,
      `Transport\t${trunk.outbound.transport}`,
      `Auth username\t${trunk.outbound.authUsername ?? '-'}`,
      `Password stored\t${yesNo(trunk.outbound.hasPassword)}`,
      `From user\t${trunk.outbound.fromUser ?? 'whatsapp'}`,
    )
  }
  if (trunk.inbound !== null) {
    lines.push(
      `Inbound username\t${trunk.inbound.username}`,
      `Realm\t${trunk.inbound.realm}`,
      `Calling session\t${trunk.inbound.session ?? 'not set (calls refused)'}`,
      `Allowed addresses\t${trunk.inbound.allowedAddresses.join(', ')}`,
      `Allowed destinations\t${
        trunk.inbound.allowedDestinations.length === 0
          ? 'any'
          : trunk.inbound.allowedDestinations.join(', ')
      }`,
    )
  }
  lines.push(`Updated\t${trunk.updatedAt}`)
  return lines.join('\n')
}

export function renderSipTrunkCreated(created: SipTrunkCreated): string {
  const trunk = renderSipTrunk(created.trunk)
  return created.inboundCredentials === undefined
    ? trunk
    : `${trunk}\n\n${renderSipTrunkCredentials(created.inboundCredentials)}`
}

export function renderSipTrunkCredentials(
  credentials: SipTrunkCredentials,
): string {
  return [
    `Username\t${credentials.username}`,
    `Password\t${credentials.password}`,
    `Realm\t${credentials.realm}`,
    'Store the password now; it cannot be shown again.',
  ].join('\n')
}

export function renderSipEndpoint(endpoint: SipEndpoint): string {
  if (endpoint.status !== 'hosted' || endpoint.host === null) {
    return 'This environment has no SIP address.'
  }
  const lines = [`Host\t${endpoint.host}`]
  for (const transport of endpoint.transports) {
    lines.push(
      `Transport\t${transport.transport.toUpperCase()} ${transport.port}, SRTP ${
        transport.srtp === 'required' ? 'required' : 'not supported'
      }`,
    )
  }
  if (endpoint.rtp !== null) {
    lines.push(
      `RTP\t${endpoint.rtp.protocol.toUpperCase()} ${endpoint.rtp.portMin}-${endpoint.rtp.portMax}`,
    )
  }
  lines.push(
    `Allow SIP and RTP in both directions between your PBX and the addresses ${endpoint.host} resolves to.`,
  )
  return lines.join('\n')
}

/** Credentials followed by the SIP address the PBX registers against, when known. */
export function withSipEndpoint(
  human: string,
  endpoint: SipEndpoint | undefined,
): string {
  if (endpoint === undefined) return human
  return `${human}\n\nSIP address\n${renderSipEndpoint(endpoint)}`
}

export function renderSipTrunkDeleted(deleted: SipTrunkDeleted): string {
  return `Deleted SIP trunk ${deleted.id}.`
}

// ── Helpers ────────────────────────────────────────────────────────────────

function validateTrunkId(trunkId: string): string {
  const trimmed = trunkId.trim()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throw new PolymorfaConfigurationError(
      'SIP trunk ID must be a UUID.',
      'trunk',
    )
  }
  return trimmed
}

const SIP_TRANSPORTS: ReadonlySet<string> = new Set(['udp', 'tcp', 'tls'])

function decodeSipEndpoint(
  body: unknown,
  metadata: ResponseMetadata,
): SipEndpoint {
  const data = isRecord(body) ? body.data : undefined
  if (isSipEndpoint(data)) return data
  throw new PolymorfaServerError(
    'The Polymorfa API returned an invalid SIP address response.',
    {
      code: 'invalid_response',
      details: body,
      metadata,
      status: metadata.status,
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  )
}

function isSipEndpoint(value: unknown): value is SipEndpoint {
  if (!isRecord(value) || !Array.isArray(value.transports)) return false
  if (value.status === 'sip_not_hosted') {
    return (
      value.host === null && value.rtp === null && value.transports.length === 0
    )
  }
  if (value.status !== 'hosted') return false
  if (typeof value.host !== 'string' || value.host.length === 0) return false
  const rtp = value.rtp
  if (
    rtp !== null &&
    !(
      isRecord(rtp) &&
      rtp.protocol === 'udp' &&
      isPort(rtp.portMin) &&
      isPort(rtp.portMax)
    )
  ) {
    return false
  }
  return value.transports.every(
    (transport) =>
      isRecord(transport) &&
      typeof transport.transport === 'string' &&
      SIP_TRANSPORTS.has(transport.transport) &&
      isPort(transport.port) &&
      (transport.srtp === 'required' || transport.srtp === 'not_supported'),
  )
}

function isPort(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= 65535
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectInput(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PolymorfaValidationError(
      `${label} input must contain one JSON object.`,
      {code: 'invalid_sip_trunk_input'},
    )
  }
  return input as Record<string, unknown>
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

function result<T>(data: T, metadata: ResponseMetadata): SipTrunkResult<T> {
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
