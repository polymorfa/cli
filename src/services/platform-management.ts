import {
  type ApiKey,
  type ApiKeyDeactivation,
  type AuditLog,
  type ClientInstance,
  type ListAuditLogsParams,
  type OrganizationMember,
  PolymorfaValidationError,
  type ProjectToken,
  type RequestOptions,
  type ResponseMetadata,
  type SecurityIncident,
  type SecurityIncidentAcknowledgement,
  type SessionBan,
  type SessionBatchRemoveResult,
  type SessionBatchRequest,
  type SessionBatchStopResult,
} from '@polymorfa/sdk'

export interface PlatformResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listApiKeys(
  client: ClientInstance<'organization'>,
): Promise<PlatformResult<readonly ApiKey[]>> {
  const response = await client.apiKeys.list()
  return result(response.data.data, response.metadata)
}

export async function revokeApiKey(
  client: ClientInstance<'organization'>,
  keyId: string,
  options: RequestOptions = {},
): Promise<PlatformResult<ApiKeyDeactivation>> {
  const response = await client.apiKeys.deactivate(keyId, options)
  return result(response.data.data, response.metadata)
}

export async function listMembers(
  client: ClientInstance<'organization'>,
): Promise<PlatformResult<readonly OrganizationMember[]>> {
  const response = await client.members.list()
  return result(response.data.data, response.metadata)
}

export async function listAuditLogs(
  client: ClientInstance<'organization'>,
  params: ListAuditLogsParams = {},
): Promise<PlatformResult<readonly AuditLog[]>> {
  const response = await client.auditLogs.list(params)
  return result(response.data.data, response.metadata)
}

export async function listSessionBans(
  client: ClientInstance<'organization'>,
  activeOnly: boolean,
): Promise<PlatformResult<readonly SessionBan[]>> {
  const response = activeOnly
    ? await client.sessionBans.listActive()
    : await client.sessionBans.list()
  return result(response.data.data, response.metadata)
}

export async function listSecurityIncidents(
  client: ClientInstance<'organization'>,
): Promise<PlatformResult<readonly SecurityIncident[]>> {
  const response = await client.securityIncidents.list()
  return result(response.data.data, response.metadata)
}

export async function acknowledgeSecurityIncident(
  client: ClientInstance<'organization'>,
  incidentId: string,
  options: RequestOptions = {},
): Promise<PlatformResult<SecurityIncidentAcknowledgement>> {
  const response = await client.securityIncidents.acknowledge(
    incidentId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function listProjectTokens(
  client: ClientInstance<'organization'>,
  projectId: string,
): Promise<PlatformResult<readonly ProjectToken[]>> {
  const response = await client.projectTokens.list(projectId)
  return result(response.data.data, response.metadata)
}

export async function stopSessions(
  client: ClientInstance<'organization'>,
  sessionIds: readonly string[],
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<SessionBatchStopResult>> {
  const response = await client.sessions.stopMany(
    sessionBatch(sessionIds, projectId),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function deleteSessions(
  client: ClientInstance<'organization'>,
  sessionIds: readonly string[],
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<SessionBatchRemoveResult>> {
  const response = await client.sessions.deleteMany(
    sessionBatch(sessionIds, projectId),
    options,
  )
  return result(response.data.data, response.metadata)
}

export function renderApiKeys(keys: readonly ApiKey[]): string {
  if (keys.length === 0) return 'No API keys found.'
  return keys
    .map((key) =>
      [
        key.keyId,
        key.label,
        `••••${key.last4}`,
        key.isActive ? 'active' : 'inactive',
      ].join('\t'),
    )
    .join('\n')
}

export function renderMembers(members: readonly OrganizationMember[]): string {
  if (members.length === 0) return 'No organization members found.'
  return members
    .map((member) =>
      [member.email, member.name ?? '', member.role, member.status].join('\t'),
    )
    .join('\n')
}

export function renderAuditLogs(logs: readonly AuditLog[]): string {
  if (logs.length === 0) return 'No audit log entries found.'
  return logs
    .map((log) =>
      [
        timestamp(log.createdAt),
        log.action,
        log.resource,
        log.result,
        log.actorEmail,
      ].join('\t'),
    )
    .join('\n')
}

export function renderSessionBans(bans: readonly SessionBan[]): string {
  if (bans.length === 0) return 'No session bans found.'
  return bans
    .map((ban) =>
      [
        ban.sessionName,
        ban.status,
        ban.banCode ?? '',
        ban.banReason ?? '',
      ].join('\t'),
    )
    .join('\n')
}

export function renderSecurityIncidents(
  incidents: readonly SecurityIncident[],
): string {
  if (incidents.length === 0) return 'No security incidents found.'
  return incidents
    .map((incident) =>
      [
        incident.id,
        incident.resolution,
        incident.source,
        timestamp(incident.detectedAt),
        incident.acknowledgedAt === null ? 'unacknowledged' : 'acknowledged',
      ].join('\t'),
    )
    .join('\n')
}

export function renderProjectTokens(tokens: readonly ProjectToken[]): string {
  if (tokens.length === 0) return 'No project tokens found.'
  return tokens
    .map((token) =>
      [
        token.id,
        token.label ?? '',
        `${token.start}••••${token.last4}`,
        token.revokedAt === null ? 'active' : 'revoked',
      ].join('\t'),
    )
    .join('\n')
}

export function renderSessionStops(stopping: number): string {
  return `Requested stops for ${stopping} matching ${plural(stopping, 'session')}. This does not wait for completion.`
}

export function renderSessionDeletes(removed: number): string {
  return `Removed ${removed} matching ${plural(removed, 'session')} from management. Device termination is best effort.`
}

function result<T>(data: T, metadata: ResponseMetadata): PlatformResult<T> {
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

function timestamp(value: number): string {
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value
  return new Date(milliseconds).toISOString()
}

function sessionBatch(
  ids: readonly string[],
  projectId?: string,
): SessionBatchRequest {
  const sessionIds = ids.map((id) => id.trim())
  if (sessionIds.length === 0) {
    throw new PolymorfaValidationError('Provide at least one session ID.', {
      code: 'empty_session_batch',
    })
  }
  if (sessionIds.length > 100) {
    throw new PolymorfaValidationError(
      'Session batches cannot exceed 100 IDs.',
      {code: 'session_batch_too_large'},
    )
  }
  if (sessionIds.some((id) => id.length === 0)) {
    throw new PolymorfaValidationError('Session IDs cannot be empty.', {
      code: 'empty_session_id',
    })
  }
  if (new Set(sessionIds).size !== sessionIds.length) {
    throw new PolymorfaValidationError('Session IDs must be unique.', {
      code: 'duplicate_session_id',
    })
  }

  return {
    sessionIds,
    ...(projectId === undefined ? {} : {projectId}),
  }
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}
