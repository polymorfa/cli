import {
  type BanSafeClaim,
  type BanSafeCollectionSession,
  type BanSafeEnforcementSummary,
  type BanSafeFinding,
  type BanSafeHealthAction,
  type BanSafeHealthHistory,
  type BanSafeIncident,
  type BanSafeNumber,
  type BanSafeNumberDetail,
  type BanSafeSignalDefinition,
  type BanSafeTelemetryDetail,
  type BanSafeTelemetrySnapshot,
  type ClientInstance as OrganizationClient,
  type CursorPageMetadata,
  type ListBanSafeClaimsParams,
  type ListBanSafeCollectionParams,
  type ListBanSafeEnforcementParams,
  type ListBanSafeFindingsParams,
  type ListBanSafeHealthActionsParams,
  type ListBanSafeHealthHistoryParams,
  type ListBanSafeHealthParams,
  type ListBanSafeIncidentsParams,
  type ListBanSafeTelemetryHistoryParams,
  PolymorfaValidationError,
  type ProjectHealthPolicy,
  type ProjectInsuranceEvidence,
  type ProjectSafeMode,
  type ProjectWarmupPlan,
  type ReportBanSafeIncidentRequest,
  type RequestOptions,
  type ResponseMetadata,
  type SessionSafeMode,
  type UpdateProjectHealthPolicyRequest,
  type UpdateProjectInsuranceEvidenceRequest,
  type UpdateProjectSafeModeRequest,
  type UpdateProjectWarmupPlanRequest,
  type UpdateSessionSafeModeRequest,
} from '@polymorfa/sdk'

export interface BanSafeResult<T> {
  readonly data: T
  readonly metadata: ResultMetadata
}

export interface BanSafePageResult<T> extends BanSafeResult<readonly T[]> {
  readonly page: CursorPageMetadata
}

interface ResultMetadata {
  readonly apiVersion?: string
  readonly attempts: number
  readonly requestId?: string
  readonly status: number
}

export async function listHealth(
  client: OrganizationClient,
  params: ListBanSafeHealthParams,
): Promise<BanSafePageResult<BanSafeNumber>> {
  const response = await client.banSafe.listHealth(params)
  return pageResult(response.data, response.metadata)
}

export async function getHealth(
  client: OrganizationClient,
  session: string,
): Promise<BanSafeResult<BanSafeNumberDetail>> {
  const response = await client.banSafe.getHealth(session)
  return result(response.data.data, response.metadata)
}

export async function listHealthHistory(
  client: OrganizationClient,
  session: string,
  params: ListBanSafeHealthHistoryParams,
): Promise<BanSafeResult<BanSafeHealthHistory>> {
  const response = await client.banSafe.listHealthHistory(session, params)
  return result(response.data.data, response.metadata)
}

export async function listSignals(
  client: OrganizationClient,
): Promise<BanSafeResult<readonly BanSafeSignalDefinition[]>> {
  const response = await client.banSafe.listSignals()
  return result(response.data.data, response.metadata)
}

export async function getTelemetry(
  client: OrganizationClient,
  session: string,
): Promise<BanSafeResult<BanSafeTelemetryDetail>> {
  const response = await client.banSafe.getTelemetry(session)
  return result(response.data.data, response.metadata)
}

export async function listTelemetryHistory(
  client: OrganizationClient,
  session: string,
  params: ListBanSafeTelemetryHistoryParams,
): Promise<BanSafePageResult<BanSafeTelemetrySnapshot>> {
  const response = await client.banSafe.listTelemetryHistory(session, params)
  return pageResult(response.data, response.metadata)
}

export async function listCollection(
  client: OrganizationClient,
  params: ListBanSafeCollectionParams,
): Promise<BanSafePageResult<BanSafeCollectionSession>> {
  const response = await client.banSafe.listCollection(params)
  return pageResult(response.data, response.metadata)
}

export async function listFindings(
  client: OrganizationClient,
  params: ListBanSafeFindingsParams,
): Promise<BanSafePageResult<BanSafeFinding>> {
  const response = await client.banSafe.listFindings(params)
  return pageResult(response.data, response.metadata)
}

export async function listEnforcement(
  client: OrganizationClient,
  params: ListBanSafeEnforcementParams,
): Promise<BanSafePageResult<BanSafeEnforcementSummary>> {
  const response = await client.banSafe.listEnforcement(params)
  return pageResult(response.data, response.metadata)
}

export async function listIncidents(
  client: OrganizationClient,
  params: ListBanSafeIncidentsParams,
): Promise<BanSafePageResult<BanSafeIncident>> {
  const response = await client.banSafe.listIncidents(params)
  return pageResult(response.data, response.metadata)
}

export async function listClaims(
  client: OrganizationClient,
  params: ListBanSafeClaimsParams,
): Promise<BanSafePageResult<BanSafeClaim>> {
  const response = await client.banSafe.listClaims(params)
  return pageResult(response.data, response.metadata)
}

export async function getClaim(
  client: OrganizationClient,
  claimId: string,
): Promise<BanSafeResult<BanSafeClaim>> {
  const response = await client.banSafe.getClaim(claimId)
  return result(response.data.data, response.metadata)
}

export async function reportIncident(
  client: OrganizationClient,
  body: ReportBanSafeIncidentRequest,
  options: RequestOptions,
) {
  const response = await client.banSafe.createIncident(body, options)
  return result(response.data.data, response.metadata)
}

export async function retractIncident(
  client: OrganizationClient,
  incidentId: string,
  options: RequestOptions,
) {
  const response = await client.banSafe.retractIncident(incidentId, options)
  return result(response.data.data, response.metadata)
}

export async function getProjectSafeMode(
  client: OrganizationClient,
  projectId: string,
) {
  const response = await client.projects.getSafeMode(projectId)
  return result(response.data.data, response.metadata)
}

export async function updateProjectSafeMode(
  client: OrganizationClient,
  projectId: string,
  input: unknown,
  options: RequestOptions,
): Promise<BanSafeResult<ProjectSafeMode>> {
  const response = await client.projects.updateSafeMode(
    projectId,
    safeModeInput(input, false) as UpdateProjectSafeModeRequest,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function getSessionSafeMode(
  client: OrganizationClient,
  session: string,
) {
  const response = await client.sessions.getSafeMode(session)
  return result(response.data.data, response.metadata)
}

export async function updateSessionSafeMode(
  client: OrganizationClient,
  session: string,
  input: unknown,
  options: RequestOptions,
): Promise<BanSafeResult<SessionSafeMode>> {
  const response = await client.sessions.updateSafeMode(
    session,
    safeModeInput(input, true),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function getWarmupPlan(
  client: OrganizationClient,
  projectId: string,
) {
  const response = await client.projects.getWarmupPlan(projectId)
  return result(response.data.data, response.metadata)
}

export async function getInsuranceEvidence(
  client: OrganizationClient,
  projectId: string,
) {
  const response = await client.projects.getInsuranceEvidence(projectId)
  return result(response.data.data, response.metadata)
}

export async function updateInsuranceEvidence(
  client: OrganizationClient,
  projectId: string,
  input: unknown,
  options: RequestOptions,
): Promise<BanSafeResult<ProjectInsuranceEvidence>> {
  const response = await client.projects.updateInsuranceEvidence(
    projectId,
    insuranceEvidenceInput(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function updateWarmupPlan(
  client: OrganizationClient,
  projectId: string,
  input: unknown,
  options: RequestOptions,
): Promise<BanSafeResult<ProjectWarmupPlan>> {
  const response = await client.projects.updateWarmupPlan(
    projectId,
    warmupInput(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function listHealthActions(
  client: OrganizationClient,
  params: ListBanSafeHealthActionsParams,
): Promise<BanSafePageResult<BanSafeHealthAction>> {
  const response = await client.banSafe.listHealthActions(params)
  return pageResult(response.data, response.metadata)
}

export async function getHealthPolicy(
  client: OrganizationClient,
  projectId: string,
): Promise<BanSafeResult<ProjectHealthPolicy>> {
  const response = await client.projects.getHealthPolicy(projectId)
  return result(response.data.data, response.metadata)
}

export async function updateHealthPolicy(
  client: OrganizationClient,
  projectId: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<BanSafeResult<ProjectHealthPolicy>> {
  const response = await client.projects.updateHealthPolicy(
    projectId,
    healthPolicyInput(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export function renderHealthList(numbers: readonly BanSafeNumber[]): string {
  if (numbers.length === 0) return 'No BanSafe Health records found.'
  return numbers
    .map((number) =>
      [
        number.session,
        number.phoneNumber,
        number.health ?? 'unknown',
        number.band,
        number.healthSource,
      ].join('\t'),
    )
    .join('\n')
}

export function renderHealth(number: BanSafeNumberDetail): string {
  const explanation = number.healthExplanation
  return [
    `Session\t${number.session}`,
    `Phone\t${number.phoneNumber}`,
    `Health\t${number.health ?? 'unknown'}`,
    `Band\t${number.band}`,
    `Source\t${number.healthSource}`,
    `Estimator\t${number.healthEstimatorVersion ?? ''}`,
    `Reliability\t${number.healthReliability}`,
    `Coverage\t${number.healthFeatureCoverage ?? 'unknown'}`,
    `Observed state\t${number.observedAccountState?.state ?? 'not observed'}`,
    `Collection groups\t${explanation?.measuredGroups.join(', ') ?? 'unavailable'}`,
    `Missing groups\t${explanation?.missingGroups.join(', ') ?? 'unavailable'}`,
    `Findings\t${number.findings.length}`,
  ].join('\n')
}

export function renderHealthHistory(history: BanSafeHealthHistory): string {
  if (history.points.length === 0)
    return `No Health history found for ${history.session}.`
  return history.points
    .map((point) =>
      [
        point.healthEvaluatedAt,
        point.health ?? 'unknown',
        point.band ?? 'unknown',
        point.healthSource,
        point.healthFeatureCoverage ?? 'unknown',
      ].join('\t'),
    )
    .join('\n')
}

export function renderSignals(
  signals: readonly BanSafeSignalDefinition[],
): string {
  if (signals.length === 0) return 'No BanSafe telemetry signals are available.'
  return signals
    .map((signal) =>
      [signal.key, signal.group, signal.kind, signal.unit, signal.label].join(
        '\t',
      ),
    )
    .join('\n')
}

export function renderTelemetry(telemetry: BanSafeTelemetryDetail): string {
  const snapshot = telemetry.snapshot
  const measured =
    snapshot?.signals.filter((signal) => signal.measured).length ?? 0
  return [
    `Session\t${telemetry.session}`,
    `Collection\t${telemetry.collection.state}`,
    `Latest flush\t${telemetry.collection.latestFlushedAt ?? 'none'}`,
    `Fresh until\t${telemetry.collection.freshUntil ?? 'none'}`,
    `Record version\t${telemetry.collection.recordVersion ?? 'none'}`,
    `Collector version\t${telemetry.collection.collectorVersion ?? 'none'}`,
    `Partial\t${telemetry.collection.partial ?? 'unknown'}`,
    `Signals measured\t${snapshot == null ? '0/0' : `${measured}/${snapshot.signals.length}`}`,
  ].join('\n')
}

export function renderTelemetryHistory(
  snapshots: readonly BanSafeTelemetrySnapshot[],
): string {
  if (snapshots.length === 0) return 'No BanSafe telemetry snapshots found.'
  return snapshots
    .map((snapshot) => {
      const measured = snapshot.signals.filter(
        (signal) => signal.measured,
      ).length
      return [
        snapshot.flushedAt,
        snapshot.partial ? 'partial' : 'complete',
        `${measured}/${snapshot.signals.length} measured`,
      ].join('\t')
    })
    .join('\n')
}

export function renderCollection(
  sessions: readonly BanSafeCollectionSession[],
): string {
  if (sessions.length === 0) return 'No project sessions found.'
  return sessions
    .map((session) =>
      [
        session.session,
        session.collection.state,
        session.collection.latestFlushedAt ?? '',
        session.collection.collectorVersion ?? '',
        session.collection.droppedRecords ?? '',
      ].join('\t'),
    )
    .join('\n')
}

export function renderFindings(findings: readonly BanSafeFinding[]): string {
  if (findings.length === 0) return 'No BanSafe findings found.'
  return findings
    .map((finding) =>
      [
        finding.session,
        finding.key,
        finding.status,
        finding.severity ?? '',
        finding.occurrences,
        finding.lastSeenAt ?? '',
      ].join('\t'),
    )
    .join('\n')
}

export function renderEnforcement(
  records: readonly BanSafeEnforcementSummary[],
): string {
  if (records.length === 0) return 'No BanSafe enforcement records found.'
  return records
    .map((record) =>
      [
        record.session,
        record.rung,
        record.state,
        record.health ?? 'unknown',
        record.source,
        record.startedAt,
      ].join('\t'),
    )
    .join('\n')
}

export function renderIncidents(incidents: readonly BanSafeIncident[]): string {
  if (incidents.length === 0) return 'No BanSafe incidents found.'
  return incidents
    .map((incident) =>
      [
        incident.id,
        incident.session,
        incident.kind,
        incident.source,
        incident.startedAt,
        incident.closedAt ?? '',
      ].join('\t'),
    )
    .join('\n')
}

export function renderClaims(claims: readonly BanSafeClaim[]): string {
  if (claims.length === 0) return 'No BanSafe claims found.'
  return claims
    .map((claim) =>
      [
        claim.id,
        claim.session,
        claim.status,
        claim.verdict,
        claim.amountCents,
        claim.createdAt,
      ].join('\t'),
    )
    .join('\n')
}

export function renderClaim(claim: BanSafeClaim): string {
  return [
    `Claim\t${claim.id}`,
    `Session\t${claim.session}`,
    `Status\t${claim.status}`,
    `Verdict\t${claim.verdict}`,
    `Amount credits\t${claim.amountCents}`,
    `Measured credits\t${claim.measuredCents}`,
    `Cap credits\t${claim.capCents}`,
    `Window\t${claim.windowStart} to ${claim.windowEnd}`,
    `Summary\t${claim.summary}`,
    `Reason\t${claim.reason}`,
  ].join('\n')
}

export function renderSafeMode(
  mode: ProjectSafeMode | SessionSafeMode,
): string {
  const settings = 'effective' in mode ? mode.effective : mode.ceiling
  return [
    `Project\t${mode.projectId}`,
    ...('session' in mode ? [`Session\t${mode.session}`] : []),
    `Presence\t${settings.presence}`,
    `Typing\t${settings.typing}`,
    `Reads\t${settings.reads}`,
    `Pacing\t${settings.pacing}`,
    `Online hours\t${settings.onlineStart}-${settings.onlineEnd}`,
    `Entitled\t${mode.entitled}`,
    ...('mismatch' in mode ? [`Applied mismatch\t${mode.mismatch}`] : []),
  ].join('\n')
}

export function renderWarmupPlan(plan: ProjectWarmupPlan): string {
  return [
    `Project\t${plan.projectId}`,
    `Enabled\t${plan.plan.enabled}`,
    `Days\t${plan.plan.warmupDays}`,
    `Daily start\t${plan.plan.dailyStart}`,
    `Ceiling\t${plan.ceiling}`,
    `Entitled\t${plan.entitled}`,
  ].join('\n')
}

export function renderInsuranceEvidence(
  evidence: ProjectInsuranceEvidence,
): string {
  return [
    `Project\t${evidence.projectId}`,
    `Collection enabled\t${evidence.enabled}`,
    `Ban insurance included\t${evidence.banInsuranceIncluded}`,
  ].join('\n')
}

export function renderHealthActions(
  actions: readonly BanSafeHealthAction[],
): string {
  if (actions.length === 0) return 'No BanSafe Health actions found.'
  return actions
    .map((action) =>
      [
        action.id,
        action.session,
        action.mode,
        action.action,
        action.status,
        action.outcome ?? '',
        `${action.health}<${action.threshold}`,
        action.createdAt,
      ].join('\t'),
    )
    .join('\n')
}

export function renderHealthPolicy(policy: ProjectHealthPolicy): string {
  return [
    `Project\t${policy.projectId}`,
    `Version\t${policy.version}`,
    `Enabled\t${policy.enabled}`,
    `Threshold\t${policy.threshold}`,
    `Session action\t${policy.sessionAction}`,
    `Slowdown messages/second\t${policy.slowDownMps ?? 'off'}`,
    `Email notification\t${policy.emailNotification}`,
    `Webhook notification\t${policy.webhookNotification}`,
    `Email configured\t${policy.integrations.emailConfigured}`,
    `Webhook configured\t${policy.integrations.webhookConfigured}`,
  ].join('\n')
}

function healthPolicyInput(input: unknown): UpdateProjectHealthPolicyRequest {
  if (!isRecord(input))
    throw invalidPolicy('Health policy input must contain one JSON object.')
  const expected = [
    'version',
    'enabled',
    'threshold',
    'sessionAction',
    'slowDownMps',
    'emailNotification',
    'webhookNotification',
  ]
  const extras = Object.keys(input).filter((key) => !expected.includes(key))
  if (extras.length > 0)
    throw invalidPolicy(`Unknown Health policy field: ${extras[0]}.`)
  for (const key of expected)
    if (!Object.hasOwn(input, key))
      throw invalidPolicy(`Health policy input requires ${key}.`)
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 0)
    throw invalidPolicy('Health policy version must be a non-negative integer.')
  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.emailNotification !== 'boolean' ||
    typeof input.webhookNotification !== 'boolean'
  )
    throw invalidPolicy(
      'Health policy enabled and notification fields must be boolean.',
    )
  if (
    !Number.isSafeInteger(input.threshold) ||
    (input.threshold as number) < 0 ||
    (input.threshold as number) > 100
  )
    throw invalidPolicy(
      'Health policy threshold must be an integer from 0 to 100.',
    )
  if (
    typeof input.sessionAction !== 'string' ||
    !['none', 'stop', 'slow_down', 'log_out'].includes(input.sessionAction)
  )
    throw invalidPolicy(
      'Health policy sessionAction must be none, stop, slow_down, or log_out.',
    )
  if (
    input.slowDownMps !== null &&
    (typeof input.slowDownMps !== 'number' ||
      !Number.isFinite(input.slowDownMps) ||
      input.slowDownMps <= 0)
  )
    throw invalidPolicy(
      'Health policy slowDownMps must be null or a positive number.',
    )
  if (input.sessionAction === 'slow_down' && input.slowDownMps === null)
    throw invalidPolicy('slow_down requires a positive slowDownMps.')
  if (input.sessionAction !== 'slow_down' && input.slowDownMps !== null)
    throw invalidPolicy(
      'slowDownMps must be null unless sessionAction is slow_down.',
    )
  if (
    input.enabled === true &&
    input.sessionAction === 'none' &&
    input.emailNotification === false &&
    input.webhookNotification === false
  )
    throw invalidPolicy(
      'An enabled Health policy must select at least one action or notification.',
    )
  return input as unknown as UpdateProjectHealthPolicyRequest
}

function safeModeInput(
  input: unknown,
  allowInherit: boolean,
): UpdateProjectSafeModeRequest | UpdateSessionSafeModeRequest {
  if (!isRecord(input))
    throw invalidInput('Safe Mode input must contain one JSON object.')
  const allowed = [
    'presence',
    'typing',
    'reads',
    'pacing',
    ...(allowInherit ? [] : ['onlineStart', 'onlineEnd']),
  ]
  validatePatchKeys(input, allowed, 'Safe Mode')
  validateChoice(
    input,
    'presence',
    ['dark', 'online_while_sending', 'online_hours'],
    allowInherit,
  )
  validateChoice(
    input,
    'typing',
    ['off', 'before_text', 'before_all'],
    allowInherit,
  )
  validateChoice(
    input,
    'reads',
    ['off', 'replied_chats', 'all_inbound'],
    allowInherit,
  )
  validateChoice(
    input,
    'pacing',
    ['off', 'jittered', 'conversation'],
    allowInherit,
  )
  if (!allowInherit) {
    for (const key of ['onlineStart', 'onlineEnd']) {
      const value = input[key]
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) ||
          (value as number) < 0 ||
          (value as number) > 23)
      )
        throw invalidInput(`Safe Mode ${key} must be an integer from 0 to 23.`)
    }
  }
  return input
}

function warmupInput(input: unknown): UpdateProjectWarmupPlanRequest {
  if (!isRecord(input))
    throw invalidInput('Warmup plan input must contain one JSON object.')
  validatePatchKeys(
    input,
    ['enabled', 'warmupDays', 'dailyStart'],
    'Warmup plan',
  )
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean')
    throw invalidInput('Warmup plan enabled must be boolean.')
  for (const key of ['warmupDays', 'dailyStart']) {
    const value = input[key]
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || (value as number) < 0)
    )
      throw invalidInput(`Warmup plan ${key} must be a non-negative integer.`)
  }
  return input
}

function insuranceEvidenceInput(
  input: unknown,
): UpdateProjectInsuranceEvidenceRequest {
  if (!isRecord(input))
    throw invalidInput('Insurance evidence input must contain one JSON object.')
  validatePatchKeys(input, ['enabled'], 'Insurance evidence')
  if (typeof input.enabled !== 'boolean')
    throw invalidInput('Insurance evidence enabled must be boolean.')
  return input as unknown as UpdateProjectInsuranceEvidenceRequest
}

function validatePatchKeys(
  input: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const keys = Object.keys(input)
  if (keys.length === 0) throw invalidInput(`${label} input cannot be empty.`)
  const extra = keys.find((key) => !allowed.includes(key))
  if (extra !== undefined)
    throw invalidInput(`Unknown ${label} field: ${extra}.`)
}

function validateChoice(
  input: Readonly<Record<string, unknown>>,
  key: string,
  choices: readonly string[],
  allowInherit: boolean,
): void {
  const value = input[key]
  if (value === undefined) return
  if (allowInherit && value === 'inherit') return
  if (typeof value !== 'string' || !choices.includes(value))
    throw invalidInput(`Invalid Safe Mode ${key}.`)
}

function pageResult<T>(
  envelope: {readonly data: readonly T[]; readonly page: CursorPageMetadata},
  metadata: ResponseMetadata,
): BanSafePageResult<T> {
  return {...result(envelope.data, metadata), page: envelope.page}
}

function result<T>(data: T, metadata: ResponseMetadata): BanSafeResult<T> {
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

function invalidPolicy(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {
    code: 'invalid_health_policy_input',
  })
}

function invalidInput(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, {code: 'invalid_bansafe_input'})
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
