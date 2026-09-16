import {
  PolymorfaConfigurationError,
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
