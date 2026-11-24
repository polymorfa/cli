import {
  PolymorfaValidationError,
  type ClientInstance,
  type HybridMergeCandidate,
  type HybridResolution,
  type HybridTransport,
  type ConnectionHybridTransition,
  type ConnectionTierChange,
  type ConnectionTierQuoteRequest,
  type RequestOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {PlatformResult} from './platform-management.js'

export const TIER_CHOICES = ['free', 'standard', 'pro', 'inherit'] as const
export type TierChoice = (typeof TIER_CHOICES)[number]
export const HYBRID_TRANSPORTS = ['linked_devices', 'official_api'] as const

/** The API's Connection name rule, checked before sending a split. */
const CONNECTION_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface TierQuoteInput {
  readonly tier: TierChoice
  readonly projectId?: string | undefined
  readonly keep?: HybridTransport | undefined
  readonly split?: boolean | undefined
  readonly stay?: HybridTransport | undefined
  readonly newConnectionName?: string | undefined
  readonly mergeWith?: string | undefined
}

/** Builds the tier quote body, refusing flag combinations the API rejects. */
export function tierQuoteRequest(
  input: TierQuoteInput,
): ConnectionTierQuoteRequest {
  const base = {
    tierOverride: input.tier === 'inherit' ? null : input.tier,
    ...(input.projectId === undefined ? {} : {projectId: input.projectId}),
  }
  const resolution = hybridResolution(input)
  if (input.mergeWith !== undefined) {
    if (resolution !== undefined) {
      throw new PolymorfaValidationError(
        'Use --merge-with on its own; --keep and --split resolve a Hybrid Link Connection leaving Pro.',
      )
    }
    if (input.tier !== 'pro') {
      throw new PolymorfaValidationError(
        'A Hybrid Link merge needs --tier pro.',
      )
    }
    const absorbConnectionId = input.mergeWith.trim()
    if (!UUID.test(absorbConnectionId)) {
      throw new PolymorfaValidationError(
        '--merge-with needs the other Connection UUID. List pairs with `polymorfa connection hybrid-merge-candidates`.',
      )
    }
    return {...base, hybridMerge: {absorbConnectionId}}
  }
  return resolution === undefined
    ? base
    : {...base, hybridResolution: resolution}
}

function hybridResolution(input: TierQuoteInput): HybridResolution | undefined {
  if (input.split === true) {
    if (input.keep !== undefined) {
      throw new PolymorfaValidationError(
        'Choose either --keep or --split, not both.',
      )
    }
    if (input.stay === undefined || input.newConnectionName === undefined) {
      throw new PolymorfaValidationError(
        '--split needs --stay <linked_devices|official_api> and --new-connection-name <name>.',
      )
    }
    if (!CONNECTION_NAME.test(input.newConnectionName)) {
      throw new PolymorfaValidationError(
        '--new-connection-name must be 1-64 characters: a letter or digit, then letters, digits, ".", "_" or "-".',
      )
    }
    return {
      action: 'split',
      existingConnectionTransport: input.stay,
      newConnectionName: input.newConnectionName,
    }
  }
  if (input.stay !== undefined || input.newConnectionName !== undefined) {
    throw new PolymorfaValidationError(
      '--stay and --new-connection-name are used only with --split.',
    )
  }
  return input.keep === undefined
    ? undefined
    : {action: 'keep', transport: input.keep}
}

export async function quoteTierChange(
  client: ClientInstance<'team'>,
  connectionId: string,
  body: ConnectionTierQuoteRequest,
): Promise<PlatformResult<ConnectionTierChange>> {
  const response = await client.connections.quoteTierChange(connectionId, body)
  return result(response.data.data, response.metadata)
}

export async function confirmTierChange(
  client: ClientInstance<'team'>,
  connectionId: string,
  quoteId: string,
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<ConnectionTierChange>> {
  const response = await client.connections.setTierOverride(
    connectionId,
    {quoteId, ...(projectId === undefined ? {} : {projectId})},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function retrieveTierChange(
  client: ClientInstance<'team'>,
  connectionId: string,
  quoteId: string,
): Promise<PlatformResult<ConnectionTierChange>> {
  const response = await client.connections.retrieveTierChange(
    connectionId,
    quoteId,
  )
  return result(response.data.data, response.metadata)
}

export async function listHybridMergeCandidates(
  client: ClientInstance<'team'>,
  projectId: string,
): Promise<PlatformResult<readonly HybridMergeCandidate[]>> {
  const response = await client.projects.listHybridMergeCandidates(projectId)
  return result(response.data.data, response.metadata)
}

export function renderTierChange(
  change: ConnectionTierChange,
  next?: string,
): string {
  const {quote} = change
  const lines = [
    `Tier change ${change.id}: ${change.status}${change.failureReason ? ` (${change.failureReason})` : ''}`,
    `Tier: ${quote.tier}${quote.tierOverride === null ? ' (project default)' : ''}, ${quote.action}, ${quote.amountCents} credits, effective ${isoTime(quote.effectiveAtMs)}`,
  ]
  if (change.status === 'quoted')
    lines.push(`Quote expires ${isoTime(change.expiresAtMs)}`)
  if (quote.hybridTransition !== undefined)
    lines.push(...renderHybridTransition(quote.hybridTransition))
  if (
    change.status === 'rejected' &&
    change.failureReason === 'hybrid_choice_required'
  )
    lines.push(
      'This Hybrid Link Connection needs a choice before leaving Pro. Quote again with --keep linked_devices|official_api, or --split --stay linked_devices|official_api --new-connection-name NAME.',
    )
  if (next !== undefined) lines.push(next)
  return lines.join('\n')
}

function renderHybridTransition(
  transition: ConnectionHybridTransition,
): string[] {
  const plan =
    transition.action === 'keep'
      ? `keep ${transition.keepTransport} on ${transition.survivingConnectionId}; the other method is disconnected`
      : transition.action === 'split'
        ? `split: ${transition.existingConnectionTransport} stays on ${transition.survivingConnectionId}; the other method moves to new Connection "${transition.newConnectionName}"${transition.newConnectionId === undefined ? '' : ` (${transition.newConnectionId})`}`
        : `merge ${transition.absorbConnectionId} into ${transition.survivingConnectionId}`
  const lines = [
    `Hybrid Link: ${plan}`,
    `Hybrid Link status: ${transition.status ?? 'not confirmed'}${transition.failureReason ? ` (${transition.failureReason})` : ''}${transition.effectiveAtMs == null ? '' : `, runs ${isoTime(transition.effectiveAtMs)}`}`,
  ]
  if (transition.metaDisconnectRequired === true)
    lines.push(
      'Action required: disconnect the Official API in the WhatsApp Business app under Settings > Account > Business Platform > Disconnect Account.',
    )
  return lines
}

/** Customer wording for each candidate `ineligibleReason`. */
const MERGE_INELIGIBLE_REASONS: Readonly<Record<string, string>> = {
  deletion_in_progress: 'a Connection is being deleted',
  transition_in_progress: 'a tier or Hybrid Link change is already running',
  pairing_in_progress: 'a Connection is still pairing',
  hms_enabled:
    'both Connections use hosted message storage; disable it on one Connection',
  not_coexistence:
    'the Official API Connection does not share the number with the WhatsApp Business app',
  different_customer: 'the Connections belong to different Customers',
  connection_disabled: 'a connection is disabled',
  not_connected: 'both Connections must be connected',
}

export function renderMergeCandidates(
  candidates: readonly HybridMergeCandidate[],
): string {
  if (candidates.length === 0) return 'No same-number pairs found.'
  return candidates
    .map((candidate) => {
      const reason = candidate.ineligibleReason
      const verdict = candidate.eligible
        ? 'eligible'
        : `ineligible: ${reason === undefined ? 'unknown' : `${reason} (${MERGE_INELIGIBLE_REASONS[reason] ?? 'see the API reason'})`}`
      const keep = candidate.connections.filter(
        (connection) => !connection.canBeAbsorbed,
      )
      return [
        ...candidate.connections.map(
          (connection) =>
            `${connection.id} (${connection.name}, ${connection.method}, ${connection.status}, ${connection.canBeAbsorbed ? 'can be absorbed' : 'must be kept'})`,
        ),
        verdict,
        ...(candidate.eligible && keep.length === 1
          ? [
              `merge with: connection tier quote ${keep[0]!.id} --tier pro --merge-with ${candidate.connections.find((connection) => connection.canBeAbsorbed)!.id}`,
            ]
          : []),
      ].join('\t')
    })
    .join('\n')
}

function isoTime(milliseconds: number): string {
  return new Date(milliseconds).toISOString()
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
