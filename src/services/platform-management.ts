import {
  type ApiKey,
  type ApiKeyDeactivation,
  type AuditLog,
  type ClientInstance,
  type ListAuditLogsParams,
  type TeamMember,
  PolymorfaValidationError,
  type ProjectToken,
  type RequestOptions,
  type ResponseMetadata,
  type SecurityIncident,
  type SecurityIncidentAcknowledgement,
  type ConnectionBan,
  type Connection,
  type ConnectionBatchRemoveResult,
  type ConnectionBatchRequest,
  type ConnectionBatchStopResult,
  type PlatformConnection,
  type ConnectionCapabilities,
  type UpdateQuickLinkSettingsInput,
  type TeamQuickLinkSettings,
  type ProjectQuickLinkSettings,
} from '@polymorfa/sdk'

type WidgetSettings = TeamQuickLinkSettings | ProjectQuickLinkSettings

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
  client: ClientInstance<'team'>,
): Promise<PlatformResult<readonly ApiKey[]>> {
  const response = await client.apiKeys.list()
  return result(response.data.data, response.metadata)
}

export async function revokeApiKey(
  client: ClientInstance<'team'>,
  keyId: string,
  options: RequestOptions = {},
): Promise<PlatformResult<ApiKeyDeactivation>> {
  const response = await client.apiKeys.deactivate(keyId, options)
  return result(response.data.data, response.metadata)
}

export async function listMembers(
  client: ClientInstance<'team'>,
): Promise<PlatformResult<readonly TeamMember[]>> {
  const response = await client.members.list()
  return result(response.data.data, response.metadata)
}

export async function listAuditLogs(
  client: ClientInstance<'team'>,
  params: ListAuditLogsParams = {},
): Promise<PlatformResult<readonly AuditLog[]>> {
  const response = await client.auditLogs.list(params)
  return result(response.data.data, response.metadata)
}

export async function listConnectionBans(
  client: ClientInstance<'team'>,
  activeOnly: boolean,
): Promise<PlatformResult<readonly ConnectionBan[]>> {
  const response = activeOnly
    ? await client.connectionBans.listActive()
    : await client.connectionBans.list()
  return result(response.data.data, response.metadata)
}

export async function listSecurityIncidents(
  client: ClientInstance<'team'>,
): Promise<PlatformResult<readonly SecurityIncident[]>> {
  const response = await client.securityIncidents.list()
  return result(response.data.data, response.metadata)
}

export async function acknowledgeSecurityIncident(
  client: ClientInstance<'team'>,
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
  client: ClientInstance<'team'>,
  projectId: string,
): Promise<PlatformResult<readonly ProjectToken[]>> {
  const response = await client.projectTokens.list(projectId)
  return result(response.data.data, response.metadata)
}

export async function listManagedConnections(
  client: ClientInstance<'team'>,
  projectId?: string,
): Promise<PlatformResult<readonly PlatformConnection[]>> {
  const response = await client.connections.list(
    projectId === undefined ? {} : {projectId},
  )
  return result(response.data.data, response.metadata)
}

export async function viewManagedConnection(
  client: ClientInstance<'team'>,
  connectionId: string,
): Promise<PlatformResult<Connection>> {
  const response = await client.connections.retrieve(connectionId)
  return result(response.data.data, response.metadata)
}

export function renderManagedConnections(
  connections: readonly PlatformConnection[],
): string {
  if (connections.length === 0) return 'No connections found.'
  return connections
    .map((connection) =>
      [
        connection.connectionId,
        connection.name,
        connection.status,
        connection.testMode ? 'test' : 'real',
        connection.projectId,
      ].join('\t'),
    )
    .join('\n')
}

export function renderManagedConnection(connection: Connection): string {
  return [
    `ID\t${connection.connectionId}`,
    `Name\t${connection.name}`,
    `Status\t${connection.status}`,
    ...(connection.statusReason === undefined
      ? []
      : [`Status reason\t${connection.statusReason}`]),
    `Type\t${connection.type}`,
    `Method\t${connection.method}`,
    `Mode\t${connection.testMode ? 'test' : 'real'}`,
    ...newChatCapLine(connection),
    `Updated\t${connection.updatedAt}`,
  ].join('\n')
}

/** WhatsApp's per-number new-chat cap, as Get connection returns it. */
interface NewChatCapView {
  readonly enabled: boolean | null
  readonly capped: boolean
  readonly limit: number | null
  readonly used: number | null
  readonly resetsAt: string | null
}

function newChatCapLine(connection: Connection): string[] {
  const cap = (
    connection as Connection & {newChatCapping?: NewChatCapView | null}
  ).newChatCapping
  if (cap === undefined) return []
  if (cap === null) return ['New-chat cap\tnot observed yet']
  if (cap.enabled === null) return ['New-chat cap\tundetermined']
  if (!cap.enabled) return ['New-chat cap\tnot enabled by WhatsApp']
  const reset = cap.resetsAt === null ? '' : ` until ${cap.resetsAt}`
  if (cap.capped) return [`New-chat cap\tcapped${reset}`]
  if (cap.limit === null || cap.used === null)
    return ['New-chat cap\tenabled by WhatsApp']
  return [`New-chat cap\t${cap.used} of ${cap.limit} used${reset}`]
}

export async function stopConnections(
  client: ClientInstance<'team'>,
  connectionIds: readonly string[],
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<ConnectionBatchStopResult>> {
  const response = await client.connections.stopMany(
    connectionBatch(connectionIds, projectId),
    options,
  )
  return result(response.data.data, response.metadata)
}

/** WhatsApp features and limits WhatsApp enabled for a number (beta). */
export async function getConnectionCapabilities(
  client: ClientInstance<'team'>,
  connection: string,
): Promise<PlatformResult<ConnectionCapabilities>> {
  const response = await client.connections.getCapabilities(connection)
  return result(response.data.data, response.metadata)
}

export function renderConnectionCapabilities(
  capabilities: ConnectionCapabilities,
): string {
  const header = [
    `Connection\t${capabilities.connection}`,
    `Status\t${capabilities.status}`,
    `Synced\t${capabilities.syncedAt ?? 'never'}`,
    `Account\t${capabilities.accountType ?? 'unknown'}`,
  ]
  const rows = capabilities.capabilities.map((capability) => {
    const value =
      capability.value === null
        ? 'unknown'
        : typeof capability.value === 'boolean'
          ? capability.value
            ? 'enabled'
            : 'off'
          : `${capability.value}${capability.unit === null ? '' : ` ${capability.unit}`}`
    return `${capability.key}\t${value}\t${capability.source ?? '-'}`
  })
  return [...header, '', ...rows].join('\n')
}

export async function deleteConnections(
  client: ClientInstance<'team'>,
  connectionIds: readonly string[],
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<ConnectionBatchRemoveResult>> {
  const response = await client.connections.deleteMany(
    connectionBatch(connectionIds, projectId),
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

export function renderMembers(members: readonly TeamMember[]): string {
  if (members.length === 0) return 'No team members found.'
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

export function renderConnectionBans(bans: readonly ConnectionBan[]): string {
  if (bans.length === 0) return 'No connection bans found.'
  return bans
    .map((ban) =>
      [
        ban.connectionName,
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

export async function viewWidgetSettings(
  client: ClientInstance<'team'>,
  projectId?: string,
): Promise<PlatformResult<WidgetSettings | null>> {
  const response = await (
    projectId === undefined ? client : client.project(projectId)
  ).quickLinkSettings.retrieve()
  return result(response.data, response.metadata)
}

export async function updateWidgetSettings(
  client: ClientInstance<'team'>,
  input: unknown,
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<WidgetSettings>> {
  const response = await (
    projectId === undefined ? client : client.project(projectId)
  ).quickLinkSettings.update(widgetUpdate(input), options)
  return result(response.data, response.metadata)
}

export function renderWidgetSettings(
  settings: WidgetSettings | null,
  requestedProjectId?: string,
): string {
  if (settings === null) {
    return requestedProjectId === undefined
      ? 'No saved team-default widget settings found.'
      : `No saved widget settings found for project ${requestedProjectId}.`
  }

  return [
    `ID\t${settings.id}`,
    `Scope\t${settings.projectId ?? 'team defaults'}`,
    `Enabled\t${settings.enabled}`,
    `Methods\t${settings.methods?.join(', ') ?? 'default'}`,
    `Theme\t${settings.theme}`,
    `Business name\t${settings.businessName ?? ''}`,
    `Success callback URL\t${settings.successCallbackUrl ?? ''}`,
    `Failure callback URL\t${settings.failureCallbackUrl ?? ''}`,
    `Allow phone change\t${settings.allowPhoneChange}`,
    `Hide watermark\t${settings.hideWatermark}`,
    `Shape\t${settings.shape ?? 'default'}`,
    `Radius\t${settings.radiusPx ?? 'default'}`,
    `Logo\t${settings.logoMode}`,
    `History sync\t${settings.historySync}`,
  ].join('\n')
}

export function renderConnectionStops(stopping: number): string {
  return `Requested stops for ${stopping} matching ${plural(stopping, 'connection')}. This does not wait for completion.`
}

export function renderConnectionDeletes(removed: number): string {
  return `Removed ${removed} matching ${plural(removed, 'connection')} from management. Device termination is best effort.`
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

function widgetUpdate(input: unknown): UpdateQuickLinkSettingsInput {
  if (!isRecord(input)) {
    throw new PolymorfaValidationError(
      'Widget input must contain one JSON object.',
      {code: 'invalid_widget_input'},
    )
  }
  if (Object.hasOwn(input, 'projectId')) {
    throw new PolymorfaValidationError(
      'Widget input cannot contain projectId; use --project to select the target.',
      {code: 'widget_project_in_input'},
    )
  }

  return {
    ...input,
  }
}

function connectionBatch(
  ids: readonly string[],
  projectId?: string,
): ConnectionBatchRequest {
  const connectionIds = ids.map((id) => id.trim())
  if (connectionIds.length === 0) {
    throw new PolymorfaValidationError('Provide at least one connection ID.', {
      code: 'empty_connection_batch',
    })
  }
  if (connectionIds.length > 100) {
    throw new PolymorfaValidationError(
      'Connection batches cannot exceed 100 IDs.',
      {code: 'connection_batch_too_large'},
    )
  }
  if (connectionIds.some((id) => id.length === 0)) {
    throw new PolymorfaValidationError('Connection IDs cannot be empty.', {
      code: 'empty_connection_id',
    })
  }
  if (new Set(connectionIds).size !== connectionIds.length) {
    throw new PolymorfaValidationError('Connection IDs must be unique.', {
      code: 'duplicate_connection_id',
    })
  }

  return {
    connectionIds,
    ...(projectId === undefined ? {} : {projectId}),
  }
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
