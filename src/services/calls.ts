import {
  assertCallMediaMuteSupported,
  muteCallMedia,
} from './call-media-controls.js'
import {randomBytes} from 'node:crypto'

import {
  CallClaimedError,
  CallsApiError,
  CallsAuthError,
  CallsClient,
  CallsError,
  type Call,
  type CallClaim,
  type CallEndReason,
  type CallState,
} from '@polymorfa/sdk/calls'
import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaValidationError,
  type MessagingClient,
  type CallInboundRoute,
  type MessagingCredential,
  type ResponseMetadata,
  type SessionCallSettings,
  type SuccessResponse,
  type VoipAcceptCallResult,
  type VoipParticipant,
  type VoipPlaceCallResult,
} from '@polymorfa/sdk'

import type {
  CallRetention,
  CallRetentionClient,
  CallRetentionPolicy,
} from '../sdk/client.js'

/** Unified Calls credential facts the commands need before any transport. */
export interface CallsCredential {
  readonly type: MessagingCredential['type']
  readonly value: string
}

export interface CallsResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

const PARTICIPANT_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const CALL_TARGET_PATTERN = /^(?:\+[1-9]\d{1,14}|[1-9]\d{0,18})$/
const DEFAULT_BASE_URL = 'https://api.polymorfa.com'

// ── Validation ─────────────────────────────────────────────────────────────

export function validateCallId(callId: string): string {
  if (callId.trim().length === 0) {
    throw new PolymorfaConfigurationError('Call ID cannot be empty.', 'call')
  }
  return callId
}

export function validateCallTarget(value: string, field = 'to'): string {
  const target = value.trim()
  if (!CALL_TARGET_PATTERN.test(target)) {
    throw new PolymorfaConfigurationError(
      'Call target must be an E.164 phone number such as +15550100 or a numeric user ID.',
      field,
    )
  }
  return target
}

export function validateConnectionId(value: string): string {
  if (!CONNECTION_ID_PATTERN.test(value)) {
    throw new PolymorfaConfigurationError(
      'Connection ID must be 8 to 64 letters, digits, underscores, or hyphens.',
      'connectionId',
    )
  }
  return value
}

/**
 * Server credentials may name the acting participant. Client tokens always act
 * as their own `client:<ephemeralId>` participant.
 */
export function validateParticipant(
  credential: CallsCredential,
  participant: string | undefined,
): string | undefined {
  if (participant === undefined) return undefined
  if (credential.type === 'clientToken') {
    throw new PolymorfaConfigurationError(
      'Client tokens act as their own participant; --participant requires a server API key.',
      'participant',
    )
  }
  if (!PARTICIPANT_PATTERN.test(participant)) {
    throw new PolymorfaConfigurationError(
      'Participant must be 1 to 128 letters, digits, or . _ : @ - characters.',
      'participant',
    )
  }
  return participant
}

function requireServerSession(
  credential: CallsCredential,
  session: string | undefined,
  action: string,
): string | undefined {
  const trimmed = session?.trim()
  if (trimmed !== undefined && trimmed.length === 0) {
    throw new PolymorfaConfigurationError('Session cannot be empty.', 'session')
  }
  if (credential.type !== 'clientToken' && trimmed === undefined) {
    throw new PolymorfaConfigurationError(
      `${action} with a server API key requires --session. Client tokens use the session they are bound to.`,
      'session',
    )
  }
  return trimmed
}

// ── REST operations ────────────────────────────────────────────────────────

export interface PlaceCallInput {
  readonly exclusive?: boolean | undefined
  readonly participant?: string | undefined
  readonly session?: string | undefined
  readonly to: string
  readonly video?: boolean | undefined
}

export async function placeCall(
  client: MessagingClient,
  credential: CallsCredential,
  input: PlaceCallInput,
): Promise<CallsResult<VoipPlaceCallResult>> {
  const to = validateCallTarget(input.to)
  const session = requireServerSession(
    credential,
    input.session,
    'Placing a call',
  )
  const participant = validateParticipant(credential, input.participant)
  const response = await callRequest(() =>
    client.voip.place({
      to,
      ...(session === undefined ? {} : {session}),
      ...(input.video === undefined ? {} : {video: input.video}),
      ...(input.exclusive === undefined ? {} : {exclusive: input.exclusive}),
      ...(participant === undefined ? {} : {participant}),
    }),
  )
  return result(response.data.data, response.metadata)
}

export interface AcceptCallInput {
  readonly exclusive?: boolean | undefined
  readonly participant?: string | undefined
  readonly video?: boolean | undefined
}

export async function acceptCall(
  client: MessagingClient,
  credential: CallsCredential,
  callId: string,
  input: AcceptCallInput = {},
): Promise<CallsResult<VoipAcceptCallResult>> {
  validateCallId(callId)
  const participant = validateParticipant(credential, input.participant)
  const response = await callRequest(() =>
    client.voip.accept(callId, {
      ...(input.exclusive === undefined ? {} : {exclusive: input.exclusive}),
      ...(input.video === undefined ? {} : {video: input.video}),
      ...(participant === undefined ? {} : {participant}),
    }),
  )
  return result(response.data.data, response.metadata)
}

export async function declineCall(
  client: MessagingClient,
  credential: CallsCredential,
  callId: string,
  input: {readonly participant?: string | undefined} = {},
): Promise<CallsResult<SuccessResponse>> {
  validateCallId(callId)
  const participant = validateParticipant(credential, input.participant)
  const response = await callRequest(() =>
    client.voip.reject(callId, participant === undefined ? {} : {participant}),
  )
  return result(response.data, response.metadata)
}

export async function leaveCall(
  client: MessagingClient,
  credential: CallsCredential,
  callId: string,
  input: {
    readonly connectionId: string
    readonly participant?: string | undefined
  },
): Promise<CallsResult<SuccessResponse>> {
  validateCallId(callId)
  const connectionId = validateConnectionId(input.connectionId)
  const participant = validateParticipant(credential, input.participant)
  const response = await callRequest(() =>
    client.voip.leave(callId, {
      connectionId,
      ...(participant === undefined ? {} : {participant}),
    }),
  )
  return result(response.data, response.metadata)
}

export async function endCall(
  client: MessagingClient,
  callId: string,
): Promise<CallsResult<SuccessResponse>> {
  validateCallId(callId)
  const response = await callRequest(() => client.voip.end(callId))
  return result(response.data, response.metadata)
}

export async function inviteToCall(
  client: MessagingClient,
  callId: string,
  target: string,
): Promise<CallsResult<VoipParticipant>> {
  validateCallId(callId)
  const to = validateCallTarget(target, 'target')
  const response = await callRequest(() =>
    client.voip.addParticipant(callId, {to}),
  )
  return result(response.data.data, response.metadata)
}

export async function viewCallSettings(
  client: MessagingClient,
  session: string,
): Promise<CallsResult<SessionCallSettings>> {
  const response = await client.voip.retrieveCallSettings(
    validateSession(session),
  )
  return result(response.data.data, response.metadata)
}

export interface CallSettingsChanges {
  readonly callsEnabled?: boolean
  /** Apply only if the settings still have this revision. */
  readonly expectedRevision?: number
  readonly hostCloudApiCalls?: boolean
  readonly conferenceMode?: boolean
  readonly inboundRoute?: CallInboundRoute
  readonly sipClaim?: boolean
  readonly sipTrunkId?: string
}

/**
 * Change the given settings. The API keeps every setting that is not sent,
 * so no read is needed first.
 */
export async function updateCallSettings(
  client: MessagingClient,
  session: string,
  changes: CallSettingsChanges,
): Promise<CallsResult<SessionCallSettings>> {
  const name = validateSession(session)
  const {expectedRevision, ...settings} = changes
  if (Object.values(settings).every((value) => value === undefined)) {
    throw new PolymorfaConfigurationError(
      'Provide at least one setting to change.',
      'calls-enabled',
    )
  }
  if (changes.inboundRoute === 'clients' && changes.sipTrunkId !== undefined) {
    throw new PolymorfaConfigurationError(
      '--sip-trunk requires --inbound-route sip_trunk.',
      'sip-trunk',
    )
  }
  // A trunk alone switches the route to it.
  const inboundRoute =
    changes.inboundRoute ??
    (changes.sipTrunkId === undefined ? undefined : 'sip_trunk')
  const response = await client.voip.updateCallSettings(name, {
    ...(changes.callsEnabled === undefined
      ? {}
      : {callsEnabled: changes.callsEnabled}),
    ...(changes.conferenceMode === undefined
      ? {}
      : {conferenceMode: changes.conferenceMode}),
    ...(inboundRoute === undefined ? {} : {inboundRoute}),
    ...(changes.sipTrunkId === undefined
      ? {}
      : {sipTrunkId: changes.sipTrunkId}),
    ...(changes.sipClaim === undefined ? {} : {sipClaim: changes.sipClaim}),
    ...(changes.hostCloudApiCalls === undefined
      ? {}
      : {hostCloudApiCalls: changes.hostCloudApiCalls}),
    ...(expectedRevision === undefined ? {} : {expectedRevision}),
  })
  return result(response.data.data, response.metadata)
}

function validateSession(session: string): string {
  const trimmed = session.trim()
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new PolymorfaConfigurationError(
      'Session must contain 1 to 128 characters.',
      'session',
    )
  }
  return trimmed
}

// ── Team call data retention ───────────────────────────────────────────────

/** The period each named policy sets; `custom` takes --days. */
export const CALL_RETENTION_PERIODS: Readonly<
  Record<Exclude<CallRetentionPolicy, 'custom'>, number>
> = {short: 7, standard: 30, extended: 90, compliance: 365}

export const CALL_RETENTION_POLICIES: readonly CallRetentionPolicy[] = [
  'short',
  'standard',
  'extended',
  'compliance',
  'custom',
]

export const MIN_CALL_RETENTION_DAYS = 1
export const MAX_CALL_RETENTION_DAYS = 2555

export async function viewCallRetention(
  client: CallRetentionClient,
): Promise<CallsResult<CallRetention>> {
  const response = await retentionRequest('read', () => client.retrieve())
  return result(response.data, response.metadata)
}

export interface CallRetentionChange {
  /** Apply only if the setting still has this revision. */
  readonly expectedRevision: number
  readonly policy: CallRetentionPolicy
  readonly retentionDays?: number | undefined
}

/**
 * Shortening the period deletes stored call data. The command decides how to
 * confirm; this is called only when the new period is shorter.
 */
export type ConfirmShorterRetention = (
  current: CallRetention,
  retentionDays: number,
) => Promise<void>

/**
 * Change the team's call data retention. Reads the current setting first so
 * a shorter period is confirmed before anything is deleted, and so a stale
 * --expected-revision fails before the change is sent.
 */
export async function updateCallRetention(
  client: CallRetentionClient,
  change: CallRetentionChange,
  confirmShorter: ConfirmShorterRetention,
): Promise<CallsResult<CallRetention>> {
  const retentionDays = callRetentionDays(change.policy, change.retentionDays)
  const current = (await retentionRequest('change', () => client.retrieve()))
    .data
  if (current.revision !== change.expectedRevision) {
    throw new PolymorfaConflictError(retentionConflict, {
      code: 'state_conflict',
      details: {
        currentRevision: current.revision,
        expectedRevision: change.expectedRevision,
      },
      status: 409,
    })
  }
  if (
    typeof current.retentionDays !== 'number' ||
    retentionDays < current.retentionDays
  ) {
    await confirmShorter(current, retentionDays)
  }
  const response = await retentionRequest('change', () =>
    client.update({
      expectedRevision: change.expectedRevision,
      policy: change.policy,
      ...(change.retentionDays === undefined
        ? {}
        : {retentionDays: change.retentionDays}),
    }),
  )
  return result(response.data, response.metadata)
}

/** The period a change sets, checked the way the API checks it. */
export function callRetentionDays(
  policy: CallRetentionPolicy,
  retentionDays: number | undefined,
): number {
  if (
    retentionDays !== undefined &&
    (!Number.isInteger(retentionDays) ||
      retentionDays < MIN_CALL_RETENTION_DAYS ||
      retentionDays > MAX_CALL_RETENTION_DAYS)
  ) {
    throw new PolymorfaConfigurationError(
      `--days must be a whole number from ${MIN_CALL_RETENTION_DAYS} to ${MAX_CALL_RETENTION_DAYS}.`,
      'days',
    )
  }
  if (policy === 'custom') {
    if (retentionDays === undefined) {
      throw new PolymorfaConfigurationError(
        '--policy custom requires --days.',
        'days',
      )
    }
    return retentionDays
  }
  const period = CALL_RETENTION_PERIODS[policy]
  if (retentionDays !== undefined && retentionDays !== period) {
    throw new PolymorfaConfigurationError(
      `--policy ${policy} keeps call data for ${period} days; omit --days or use --policy custom.`,
      'days',
    )
  }
  return period
}

const retentionConflict =
  'The call retention setting changed (state_conflict); read it again with `polymorfa calls retention get` and retry with its revision.'

const retentionForbidden = {
  change:
    'Call retention is a team setting; use a team API key with the sessions:read and sessions:manage scopes to change it (the command reads the setting before it changes it).',
  read: 'Call retention is a team setting; use a team API key or project token with the sessions:read scope to read it.',
} as const

/** Replace the API's generic 403 and 409 text with what the user can do. */
async function retentionRequest<T>(
  action: keyof typeof retentionForbidden,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const message =
      error instanceof PolymorfaConflictError && error.code === 'state_conflict'
        ? retentionConflict
        : error instanceof PolymorfaAuthorizationError
          ? `${retentionForbidden[action]} The API said: ${error.message}`
          : undefined
    if (message === undefined || !(error instanceof PolymorfaError)) {
      throw error
    }
    const options = {
      cause: error,
      details: error.details,
      ...(error.code === undefined ? {} : {code: error.code}),
      ...(error.status === undefined ? {} : {status: error.status}),
      ...(error.requestId === undefined ? {} : {requestId: error.requestId}),
      ...(error.requestLogUrl === undefined
        ? {}
        : {requestLogUrl: error.requestLogUrl}),
      ...(error.docUrl === undefined ? {} : {docUrl: error.docUrl}),
      ...(error.metadata === undefined ? {} : {metadata: error.metadata}),
    }
    throw error instanceof PolymorfaConflictError
      ? new PolymorfaConflictError(message, options)
      : new PolymorfaAuthorizationError(message, options)
  }
}

/** Replace the API's generic conflict text with the Calls meaning of its code. */
async function callRequest<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof PolymorfaConflictError) {
      const message = conflictMessages[error.code ?? '']
      if (message !== undefined) {
        throw new PolymorfaConflictError(message, {
          cause: error,
          ...(error.code === undefined ? {} : {code: error.code}),
          ...(error.status === undefined ? {} : {status: error.status}),
          ...(error.requestId === undefined
            ? {}
            : {requestId: error.requestId}),
          ...(error.metadata === undefined ? {} : {metadata: error.metadata}),
          details: error.details,
        })
      }
    }
    throw error
  }
}

const conflictMessages: Readonly<Record<string, string>> = {
  call_claimed:
    'Another participant claimed this call (call_claimed). It cannot be answered or joined; do not decline it.',
  call_not_ringing:
    'The call is not ringing (call_not_ringing): it was already answered, declined, or ended.',
  connection_limit:
    'The call has no free connection slot (connection_limit). Leave another connection first.',
}

// ── Rendering ──────────────────────────────────────────────────────────────

export function renderPlacedCall(call: VoipPlaceCallResult): string {
  return [
    `Call\t${call.callId}`,
    `Session\t${call.session}`,
    `Video\t${yesNo(call.video)}`,
    'The call is ringing. Watch it with polymorfa calls watch.',
  ].join('\n')
}

export function renderAcceptedCall(result: VoipAcceptCallResult): string {
  return [
    `Answered\t${yesNo(result.answered)}`,
    `Answered by\t${result.answeredBy}`,
    `Exclusive\t${yesNo(result.exclusive)}`,
  ].join('\n')
}

export function renderCallParticipant(participant: VoipParticipant): string {
  return [
    `Participant\t${participant.id}`,
    participant.phoneNumber === undefined
      ? undefined
      : `Phone\t${participant.phoneNumber}`,
    participant.username === undefined
      ? undefined
      : `Username\t${participant.username}`,
    `State\t${participant.state}`,
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderCallSettings(
  session: string,
  settings: SessionCallSettings,
): string {
  return [
    `Session\t${session}`,
    `Calls\t${settings.callsEnabled === false ? 'off' : 'on'}`,
    `Conference mode\t${settings.conferenceMode === false ? 'off' : 'on'}`,
    `Incoming calls\t${settings.inboundRoute === 'sip_trunk' ? 'clients and SIP trunk' : 'clients'}`,
    ...(settings.inboundRoute === 'sip_trunk'
      ? [
          `SIP trunk\t${settings.sipTrunkId ?? '-'}`,
          `SIP answer claims call\t${yesNo(settings.sipClaim)}`,
        ]
      : []),
    `Cloud API calls answered by\t${settings.hostCloudApiCalls === true ? 'Polymorfa Calls' : 'your Graph API integration'}`,
    `Revision\t${settings.revision ?? 0}`,
    `Updated\t${settings.updatedAt ?? 'never (defaults)'}`,
  ].join('\n')
}

export function renderCallRetention(retention: CallRetention): string {
  return [
    `Policy\t${retention.policy}`,
    `Retention\t${retention.retentionDays} ${retention.retentionDays === 1 ? 'day' : 'days'}`,
    `Applies to\t${retention.appliesTo.join(', ')}`,
    `Revision\t${retention.revision}`,
    `Updated\t${retention.updatedAt ?? 'never (defaults)'}`,
  ].join('\n')
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

function result<T>(data: T, metadata: ResponseMetadata): CallsResult<T> {
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

// ── Calls client: watch and media ──────────────────────────────────────────

export interface CallsClientInput {
  readonly baseUrl?: string | undefined
  readonly credential: CallsCredential
  readonly participant?: string | undefined
  readonly session?: string | undefined
  /** Injected for runtimes without a global WebSocket, and for tests. */
  readonly WebSocket?: typeof globalThis.WebSocket | undefined
}

/** A new media connection ID: 18 random bytes as base64url. */
export function createCallConnectionId(): string {
  return randomBytes(18).toString('base64url')
}

/**
 * Sockets and REST calls made by the Calls client carry the credential, so
 * apply the SDK's transport rule: HTTPS, or HTTP only on a loopback host.
 */
export function assertCallsBaseUrl(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new PolymorfaConfigurationError(
      'POLYMORFA_BASE_URL must be an absolute HTTP or HTTPS URL.',
      'baseUrl',
    )
  }
  if (url.username !== '' || url.password !== '') {
    throw new PolymorfaConfigurationError(
      'POLYMORFA_BASE_URL must not contain credentials.',
      'baseUrl',
    )
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new PolymorfaConfigurationError(
      'Calls require an HTTPS POLYMORFA_BASE_URL, or HTTP on a loopback host.',
      'baseUrl',
    )
  }
  return baseUrl
}

function createCallsClient(
  input: CallsClientInput,
  action: string,
): CallsClient {
  const session = requireServerSession(input.credential, input.session, action)
  if (input.credential.type === 'clientToken' && session !== undefined) {
    throw new PolymorfaConfigurationError(
      `${action} with a client token uses the session the token is bound to; omit --session.`,
      'session',
    )
  }
  const participant = validateParticipant(input.credential, input.participant)
  const WebSocketImpl = input.WebSocket ?? globalThis.WebSocket
  if (WebSocketImpl === undefined) {
    throw new PolymorfaConfigurationError(
      'Calls require Node.js 22 or later, which provides WebSocket.',
      'runtime',
    )
  }
  return new CallsClient({
    token: input.credential.value,
    // Client tokens are bound to one session and never send it.
    session: session ?? '',
    baseUrl: assertCallsBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    WebSocket: WebSocketImpl,
    ...(participant === undefined ? {} : {participant}),
  })
}

/** Translate a Calls client failure into the CLI's SDK error categories. */
export function callsClientError(
  error: unknown,
  refusal?: string,
): PolymorfaError {
  if (error instanceof PolymorfaError) return error
  if (error instanceof CallClaimedError) {
    return new PolymorfaConflictError(conflictMessages.call_claimed!, {
      code: 'call_claimed',
      status: 409,
      cause: error,
    })
  }
  if (error instanceof CallsApiError) {
    const options = {code: error.code, status: error.status, cause: error}
    const message = conflictMessages[error.code] ?? error.message
    if (error.status === 400 || error.status === 422)
      return new PolymorfaValidationError(message, options)
    if (error.status === 401)
      return new PolymorfaAuthenticationError(message, options)
    if (error.status === 403)
      return new PolymorfaAuthorizationError(message, options)
    if (error.status === 404)
      return new PolymorfaNotFoundError(message, options)
    if (error.status === 409)
      return new PolymorfaConflictError(message, options)
    if (error.status === 429)
      return new PolymorfaRateLimitError(message, options)
    return new PolymorfaServerError(message, options)
  }
  if (error instanceof CallsAuthError) {
    return new PolymorfaAuthenticationError(
      `The credential does not authorize this session${refusal === undefined ? '' : ` (${refusal})`}. Check the credential, its client rules, and the session.`,
      {code: refusal ?? error.code, cause: error},
    )
  }
  if (error instanceof CallsError) {
    if (error.code === 'invalid_request') {
      return new PolymorfaValidationError(
        'The API refused the calls connection. Check the session and participant.',
        {code: error.code, cause: error},
      )
    }
    return new PolymorfaConnectionError(error.message, {
      code: error.code,
      cause: error,
    })
  }
  return new PolymorfaConnectionError(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? {cause: error} : {},
  )
}

const unreachable: CallsStatus = {
  type: 'notice',
  code: 'connect_failed',
  message:
    'Could not connect to the calls service; retrying with backoff. Press Ctrl-C to stop.',
}

function isTerminalClientError(error: CallsError): boolean {
  return error instanceof CallsAuthError || error.code === 'invalid_request'
}

export type CallActivity =
  | {
      readonly type: 'incoming'
      readonly callId: string
      readonly peer: string
      readonly video: boolean
    }
  | ({readonly type: 'claim'; readonly callId: string} & CallClaim)
  | {
      readonly type: 'state'
      readonly callId: string
      readonly state: CallState
      readonly previous: CallState
    }
  | {
      readonly type: 'participant_joined' | 'participant_state'
      readonly callId: string
      readonly participant: VoipParticipant
    }
  | {
      readonly type: 'participant_left'
      readonly callId: string
      readonly participantId: string
      readonly reason?: string
    }
  | {
      readonly type: 'ended'
      readonly callId: string
      readonly reason: CallEndReason
      readonly duration: number
    }

export type CallsStatus =
  | {readonly type: 'ready'; readonly participant?: string}
  | {readonly type: 'disconnected'}
  | {readonly type: 'notice'; readonly code: string; readonly message: string}

/** Report a call's claim, state, and roster changes until it ends. */
function followCall(
  call: Call,
  activity: (activity: CallActivity) => void,
): void {
  call.on('claim', (claim) =>
    activity({type: 'claim', callId: call.id, ...claim}),
  )
  call.on('state', (state, previous) => {
    if (state !== 'ended') {
      activity({type: 'state', callId: call.id, state, previous})
    }
  })
  call.on('participantJoined', (participant) =>
    activity({type: 'participant_joined', callId: call.id, participant}),
  )
  call.on('participantState', (participant) =>
    activity({type: 'participant_state', callId: call.id, participant}),
  )
  call.on('participantLeft', (participantId, reason) =>
    activity({
      type: 'participant_left',
      callId: call.id,
      participantId,
      ...(reason === undefined ? {} : {reason}),
    }),
  )
}

export interface WatchCallsInput extends CallsClientInput {
  /** Stop after this many call activities. */
  readonly count?: number | undefined
  readonly signal: AbortSignal
}

export interface WatchCallsSummary {
  readonly activities: number
  readonly stoppedBy: 'count' | 'signal'
}

/**
 * Follow a session's calls with the Calls client. The client authenticates,
 * reconnects with backoff, and never answers or declines on its own. This
 * resolves on the abort signal or `count` and rejects on a terminal refusal.
 */
export async function watchCalls(
  input: WatchCallsInput,
  handlers: {
    readonly activity: (activity: CallActivity) => void
    readonly status: (status: CallsStatus) => void
  },
): Promise<WatchCallsSummary> {
  const client = createCallsClient(input, 'Watching calls')

  return new Promise<WatchCallsSummary>((resolve, reject) => {
    let activities = 0
    let finished = false
    const finish = (outcome: 'count' | 'signal' | PolymorfaError): void => {
      if (finished) return
      finished = true
      input.signal.removeEventListener('abort', onAbort)
      void client.disconnect().finally(() => {
        if (outcome instanceof PolymorfaError) reject(outcome)
        else resolve({activities, stoppedBy: outcome})
      })
    }
    const onAbort = (): void => finish('signal')
    const report = (activity: CallActivity): void => {
      if (finished) return
      handlers.activity(activity)
      activities += 1
      if (input.count !== undefined && activities >= input.count) {
        finish('count')
      }
    }

    client.on('ready', () => {
      if (finished) return
      const participant = client.participantReference
      handlers.status({
        type: 'ready',
        ...(participant === undefined ? {} : {participant}),
      })
    })
    client.on('disconnected', () => {
      if (!finished) handlers.status({type: 'disconnected'})
    })
    let refusal: string | undefined
    client.on('ready', () => {
      refusal = undefined
    })
    client.on('error', (error) => {
      if (finished) return
      if (isTerminalClientError(error)) {
        finish(callsClientError(error, refusal))
        return
      }
      if (!client.connected) refusal = error.code
      handlers.status({
        type: 'notice',
        code: error.code,
        message: error.message,
      })
    })
    client.on('incoming', (call) => {
      report({
        type: 'incoming',
        callId: call.id,
        peer: call.peer,
        video: call.hasVideo,
      })
      followCall(call, report)
    })
    client.on('ended', (call, reason) =>
      report({type: 'ended', callId: call.id, reason, duration: call.duration}),
    )

    if (input.signal.aborted) {
      finish('signal')
      return
    }
    input.signal.addEventListener('abort', onAbort, {once: true})
    client.connect().then(
      () => {
        if (!finished && !client.connected) handlers.status(unreachable)
      },
      (error: unknown) => finish(callsClientError(error)),
    )
  })
}

export interface CallMediaInput extends CallsClientInput {
  readonly muted?: boolean | undefined
  /** Answer this inbound call; without it, the next inbound call. */
  readonly callId?: string | undefined
  readonly exclusive?: boolean | undefined
  /** Raw s16le mono PCM to send, paced in real time. */
  readonly input?: AsyncIterable<Uint8Array> | undefined
  /** Leave the call once `input` is exhausted and sent. */
  readonly leaveOnEnd?: boolean | undefined
  readonly now?: (() => number) | undefined
  readonly output: (pcm: Uint8Array) => void
  /** Place a call to this target instead of answering one. */
  readonly place?: string | undefined
  readonly signal: AbortSignal
  readonly video?: boolean | undefined
}

export type CallMediaStatus =
  | CallsStatus
  | CallActivity
  | {
      readonly type: 'connected'
      readonly callId: string
      readonly connectionId: string
      readonly sampleRate: number
    }
  | {readonly type: 'placed'; readonly callId: string}
  | {readonly type: 'input_ended'; readonly bytes: number}

export interface CallMediaSummary {
  readonly bytesReceived: number
  readonly bytesSent: number
  readonly callId?: string
  readonly connectionId?: string
  readonly reason: CallEndReason | 'cancelled'
}

const FRAME_MS = 20
const MAX_BUFFERED_MS = 2_000
const FAILED_ENDINGS = new Set<CallEndReason>([
  'capacity',
  'connection_failed',
  'pod_lost',
])

/**
 * Carry one call's audio as raw PCM: place a call, or answer (or join) an
 * inbound one, then send `input` and deliver received audio to `output`.
 */
export async function bridgeCallMedia(
  input: CallMediaInput,
  status: (status: CallMediaStatus) => void,
): Promise<CallMediaSummary> {
  if (input.place !== undefined && input.callId !== undefined) {
    throw new PolymorfaConfigurationError(
      'Choose a call ID to answer or --place, not both.',
      'call',
    )
  }
  const target =
    input.place === undefined ? undefined : validateCallTarget(input.place)
  if (input.callId !== undefined) validateCallId(input.callId)
  if (input.muted === true) assertCallMediaMuteSupported()
  const client = createCallsClient(input, 'Carrying call media')

  let bytesReceived = 0
  let bytesSent = 0
  let active: Call | undefined
  let finished = false
  let resolveDone: (value: CallMediaSummary) => void = () => undefined
  let rejectDone: (error: PolymorfaError) => void = () => undefined
  const done = new Promise<CallMediaSummary>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  // A terminal error can settle `done` before `connect()` returns and the
  // function awaits it.
  done.catch(() => undefined)
  const summary = (reason: CallMediaSummary['reason']): CallMediaSummary => ({
    bytesReceived,
    bytesSent,
    reason,
    ...(active === undefined
      ? {}
      : {callId: active.id, connectionId: active.connectionId}),
  })
  const finish = (
    outcome: CallMediaSummary['reason'] | PolymorfaError,
  ): void => {
    if (finished) return
    finished = true
    if (outcome instanceof PolymorfaError) rejectDone(outcome)
    else resolveDone(summary(outcome))
  }
  let lastCallError: CallsError | undefined
  let stopping = false
  /** Settles once an answer or join in flight has finished, either way. */
  let pendingAccept: Promise<void> | undefined
  /** Stop our part: end a call still ringing that we placed, else leave. */
  const hangUp = (call: Call): void => {
    // Leaving while the answer is in flight only ends the call locally, and
    // the platform would keep this client as a participant (and claimant).
    // Wait for the answer to settle so the leave reaches the platform.
    if (pendingAccept !== undefined) {
      void pendingAccept.then(() => hangUp(call))
      return
    }
    const stop =
      call.direction === 'outbound' && call.state === 'ringing'
        ? call.end()
        : call.leave()
    stop.then(
      () => finish(call.endReason ?? 'left'),
      (error: unknown) => finish(callsClientError(error)),
    )
  }

  const ended = (call: Call, reason: CallEndReason): void => {
    status({
      type: 'ended',
      callId: call.id,
      reason,
      duration: call.duration,
    })
    if (reason === 'claimed') {
      finish(callsClientError(new CallClaimedError()))
    } else if (FAILED_ENDINGS.has(reason)) {
      finish(
        lastCallError === undefined
          ? new PolymorfaConnectionError(
              `The call media connection failed (${reason}).`,
              {code: reason},
            )
          : callsClientError(lastCallError),
      )
    } else {
      finish(reason)
    }
  }

  const attach = (call: Call): void => {
    active = call
    followCall(call, status)
    call.on('error', (error) => {
      lastCallError = error
      if (!(error instanceof CallClaimedError)) {
        status({type: 'notice', code: error.code, message: error.message})
      }
    })
    call.once('ended', (reason) => ended(call, reason))
    call.audio.on('data', (pcm) => {
      const bytes = new Uint8Array(pcm.length * 2)
      const view = new DataView(bytes.buffer)
      for (let index = 0; index < pcm.length; index += 1) {
        view.setInt16(index * 2, pcm[index] ?? 0, true)
      }
      bytesReceived += bytes.byteLength
      input.output(bytes)
    })
    call.once('connected', () => {
      const start = async (): Promise<void> => {
        if (input.muted === true) await muteCallMedia(call)
        if (finished || call.ended) return
        status({
          type: 'connected',
          callId: call.id,
          connectionId: call.connectionId,
          sampleRate: call.audio.sampleRate,
        })
        if (input.input === undefined) return
        pacePcm({
          input: input.input,
          isClosed: () => finished || call.ended,
          now: input.now ?? Date.now,
          sampleRate: () => call.audio.sampleRate,
          write: (pcm) => {
            if (call.audio.write(pcm)) bytesSent += pcm.length * 2
          },
        }).then(
          (bytes) => {
            if (finished || call.ended) return
            status({type: 'input_ended', bytes})
            if (input.leaveOnEnd === true) hangUp(call)
          },
          (error: unknown) => {
            status({
              type: 'notice',
              code: 'input_failed',
              message: error instanceof Error ? error.message : String(error),
            })
            hangUp(call)
          },
        )
      }
      void start().catch((error: unknown) => finish(callsClientError(error)))
    })
  }

  const answer = (call: Call): void => {
    attach(call)
    const joining = call.claim.canJoin && input.exclusive !== true
    const accepting = joining
      ? call.join(input.video === undefined ? {} : {video: input.video})
      : call.answer({
          exclusive: input.exclusive === true,
          ...(input.video === undefined ? {} : {video: input.video}),
        })
    const settled = accepting.then(
      () => undefined,
      (error: unknown) => {
        // A refusal after Ctrl-C is not an error: the user asked to stop.
        if (!stopping) finish(callsClientError(error))
      },
    )
    const pending = settled.finally(() => {
      if (pendingAccept === pending) pendingAccept = undefined
    })
    pendingAccept = pending
  }

  client.on('ready', () => {
    refusal = undefined
    const participant = client.participantReference
    status({
      type: 'ready',
      ...(participant === undefined ? {} : {participant}),
    })
  })
  client.on('disconnected', () => {
    if (!finished) status({type: 'disconnected'})
  })
  let refusal: string | undefined
  client.on('error', (error) => {
    if (finished) return
    if (isTerminalClientError(error)) {
      finish(callsClientError(error, refusal))
      return
    }
    if (!client.connected) refusal = error.code
    status({type: 'notice', code: error.code, message: error.message})
  })
  if (target === undefined) {
    client.on('incoming', (call) => {
      if (active !== undefined) return
      if (input.callId !== undefined && call.id !== input.callId) return
      status({
        type: 'incoming',
        callId: call.id,
        peer: call.peer,
        video: call.hasVideo,
      })
      answer(call)
    })
  }

  const onAbort = (): void => {
    stopping = true
    if (active === undefined || active.ended) finish('cancelled')
    else hangUp(active)
  }
  if (input.signal.aborted) return summary('cancelled')
  input.signal.addEventListener('abort', onAbort, {once: true})

  try {
    await client.connect()
    if (!finished && !client.connected) status(unreachable)
    let cancelledCall: Call | undefined
    if (target !== undefined && !finished) {
      try {
        const call = await client.place(target, {
          exclusive: input.exclusive === true,
          ...(input.video === undefined ? {} : {video: input.video}),
        })
        if (finished) {
          cancelledCall = call
        } else {
          status({type: 'placed', callId: call.id})
          attach(call)
          // Events that arrived before place() returned are already applied,
          // so the call may have ended without emitting to our listener.
          if (call.ended) ended(call, call.endReason ?? 'unknown')
        }
      } catch (error) {
        finish(callsClientError(error))
      }
    }
    if (cancelledCall !== undefined) {
      // Cancelled while placing: stop the callee's phone ringing. If that
      // fails the call may still ring, so report the failure rather than a
      // clean cancellation.
      try {
        await cancelledCall.end()
      } catch (error) {
        throw callsClientError(error)
      }
    }
    return await done
  } finally {
    input.signal.removeEventListener('abort', onAbort)
    await client.disconnect()
  }
}

interface PaceInput {
  readonly input: AsyncIterable<Uint8Array>
  readonly isClosed: () => boolean
  readonly now: () => number
  readonly sampleRate: () => number
  readonly write: (pcm: Int16Array) => void
}

/**
 * Send PCM no faster than real time, in 20 ms frames. The service buffers
 * only a short window, so unpaced file input would be dropped. An input
 * underrun restarts the clock instead of causing a later burst.
 */
async function pacePcm(options: PaceInput): Promise<number> {
  let pending = new Uint8Array(0)
  let ended = false
  let total = 0
  let failure: Error | undefined
  let wake: (() => void) | undefined
  const notify = (): void => {
    const current = wake
    wake = undefined
    current?.()
  }
  const sleep = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, FRAME_MS))

  void (async () => {
    try {
      for await (const chunk of options.input) {
        if (options.isClosed()) break
        const next = new Uint8Array(pending.byteLength + chunk.byteLength)
        next.set(pending)
        next.set(chunk, pending.byteLength)
        pending = next
        total += chunk.byteLength
        notify()
        const limit = bytesFor(options.sampleRate(), MAX_BUFFERED_MS)
        while (pending.byteLength > limit && !options.isClosed()) await sleep()
      }
    } catch (error) {
      failure =
        error instanceof Error ? error : new Error('Audio input failed.')
    } finally {
      ended = true
      notify()
    }
  })()

  let started: number | undefined
  let consumed = 0
  while (!options.isClosed()) {
    const available = Math.floor(pending.byteLength / 2)
    if (available === 0) {
      if (failure !== undefined) throw failure
      if (ended) break
      await new Promise<void>((resolve) => {
        wake = resolve
      })
      continue
    }
    const now = options.now()
    if (started === undefined) {
      started = now
      consumed = 0
    }
    const rate = options.sampleRate()
    const due =
      Math.floor(((now - started) * rate) / 1000) +
      samplesFor(rate, FRAME_MS) -
      consumed
    if (due > 0) {
      const count = Math.min(due, available)
      const view = new DataView(pending.buffer, pending.byteOffset, count * 2)
      const pcm = new Int16Array(count)
      for (let index = 0; index < count; index += 1) {
        pcm[index] = view.getInt16(index * 2, true)
      }
      pending = pending.slice(count * 2)
      options.write(pcm)
      consumed += count
      if (count < due) started = undefined
    }
    await sleep()
  }
  if (failure !== undefined) throw failure
  return total - (pending.byteLength % 2)
}

function samplesFor(sampleRate: number, milliseconds: number): number {
  return Math.max(1, Math.floor((sampleRate * milliseconds) / 1000))
}

function bytesFor(sampleRate: number, milliseconds: number): number {
  return samplesFor(sampleRate, milliseconds) * 2
}
