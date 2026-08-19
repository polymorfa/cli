import {
  type ApiKey,
  type ApiKeyDeactivation,
  type AuditLog,
  type ListAuditLogsParams,
  type ManagementOperation,
  type OrganizationMember,
  type PlatformClient,
  type ProjectToken,
  type RequestOptions,
  type ResponseMetadata,
  type SecurityIncident,
  type SecurityIncidentAcknowledgement,
  type SessionBan,
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
  client: PlatformClient,
): Promise<PlatformResult<readonly ApiKey[]>> {
  const response = await client.apiKeys.list()
  return result(response.data.data, response.metadata)
}

export async function revokeApiKey(
  client: PlatformClient,
  keyId: string,
  options: RequestOptions = {},
): Promise<PlatformResult<ApiKeyDeactivation>> {
  const response = await client.apiKeys.deactivate(keyId, options)
  return result(response.data.data, response.metadata)
}

export async function listMembers(
  client: PlatformClient,
): Promise<PlatformResult<readonly OrganizationMember[]>> {
  const response = await client.members.list()
  return result(response.data.data, response.metadata)
}

export async function listAuditLogs(
  client: PlatformClient,
  params: ListAuditLogsParams = {},
): Promise<PlatformResult<readonly AuditLog[]>> {
  const response = await client.auditLogs.list(params)
  return result(response.data.data, response.metadata)
}

export async function listSessionBans(
  client: PlatformClient,
  activeOnly: boolean,
): Promise<PlatformResult<readonly SessionBan[]>> {
  const response = activeOnly
    ? await client.sessionBans.listActive()
    : await client.sessionBans.list()
  return result(response.data.data, response.metadata)
}

export async function listSecurityIncidents(
  client: PlatformClient,
): Promise<PlatformResult<readonly SecurityIncident[]>> {
  const response = await client.securityIncidents.list()
  return result(response.data.data, response.metadata)
}

export async function acknowledgeSecurityIncident(
  client: PlatformClient,
  incidentId: string,
  options: RequestOptions = {},
): Promise<PlatformResult<SecurityIncidentAcknowledgement>> {
  const response = await client.securityIncidents.acknowledge(
    incidentId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewPlatformOperation(
  client: PlatformClient,
  operationId: string,
): Promise<PlatformResult<ManagementOperation>> {
  const response = await client.operations.retrieve(operationId)
  return result(response.data.data, response.metadata)
}

export async function listProjectTokens(
  client: PlatformClient,
  projectId: string,
): Promise<PlatformResult<readonly ProjectToken[]>> {
  const response = await client.projectTokens.list(projectId)
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

export function renderPlatformOperation(
  operation: ManagementOperation,
): string {
  return [
    `ID\t${operation.id}`,
    `Kind\t${operation.kind}`,
    `Status\t${operation.status}`,
    `Resource\t${operation.resourceType}\t${operation.resourceId}`,
    ...(operation.projectId === null
      ? []
      : [`Project\t${operation.projectId}`]),
    ...(operation.progressCode === null
      ? []
      : [`Progress\t${operation.progressCode}`]),
    ...(operation.failureCode === null
      ? []
      : [`Failure\t${operation.failureCode}`]),
    `Created\t${operation.createdAt}`,
    `Updated\t${operation.updatedAt}`,
  ].join('\n')
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
