import {
  PolymorfaValidationError,
  type ClientInstance,
  type HybridMergeCandidate,
  type HybridResolution,
  type HybridTransport,
  type NumberHybridTransition,
  type NumberTierChange,
  type NumberTierQuoteRequest,
  type RequestOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {PlatformResult} from './platform-management.js'

export const TIER_CHOICES = ['free', 'standard', 'pro', 'inherit'] as const
export type TierChoice = (typeof TIER_CHOICES)[number]
export const HYBRID_TRANSPORTS = ['linked_devices', 'official_api'] as const

/** The API's Number name rule, checked before sending a split. */
const NUMBER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface TierQuoteInput {
  readonly tier: TierChoice
  readonly projectId?: string | undefined
  readonly keep?: HybridTransport | undefined
  readonly split?: boolean | undefined
  readonly stay?: HybridTransport | undefined
  readonly newNumberName?: string | undefined
  readonly mergeWith?: string | undefined
}

/** Builds the tier quote body, refusing flag combinations the API rejects. */
export function tierQuoteRequest(
  input: TierQuoteInput,
): NumberTierQuoteRequest {
  const base = {
    tierOverride: input.tier === 'inherit' ? null : input.tier,
    ...(input.projectId === undefined ? {} : {projectId: input.projectId}),
  }
  const resolution = hybridResolution(input)
  if (input.mergeWith !== undefined) {
    if (resolution !== undefined) {
      throw new PolymorfaValidationError(
        'Use --merge-with on its own; --keep and --split resolve a Hybrid Link Number leaving Pro.',
      )
    }
    if (input.tier !== 'pro') {
      throw new PolymorfaValidationError(
        'A Hybrid Link merge needs --tier pro.',
      )
    }
    const absorbNumberId = input.mergeWith.trim()
    if (!UUID.test(absorbNumberId)) {
      throw new PolymorfaValidationError(
        '--merge-with needs the other Number UUID. List pairs with `polymorfa session hybrid-merge-candidates`.',
      )
    }
    return {...base, hybridMerge: {absorbNumberId}}
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
    if (input.stay === undefined || input.newNumberName === undefined) {
      throw new PolymorfaValidationError(
        '--split needs --stay <linked_devices|official_api> and --new-number-name <name>.',
      )
    }
    if (!NUMBER_NAME.test(input.newNumberName)) {
      throw new PolymorfaValidationError(
        '--new-number-name must be 1-64 characters: a letter or digit, then letters, digits, ".", "_" or "-".',
      )
    }
    return {
      action: 'split',
      existingNumberTransport: input.stay,
      newNumberName: input.newNumberName,
    }
  }
  if (input.stay !== undefined || input.newNumberName !== undefined) {
    throw new PolymorfaValidationError(
      '--stay and --new-number-name are used only with --split.',
    )
  }
  return input.keep === undefined
    ? undefined
    : {action: 'keep', transport: input.keep}
}

export async function quoteTierChange(
  client: ClientInstance<'organization'>,
  sessionId: string,
  body: NumberTierQuoteRequest,
): Promise<PlatformResult<NumberTierChange>> {
  const response = await client.sessions.quoteTierChange(sessionId, body)
  return result(response.data.data, response.metadata)
}

export async function confirmTierChange(
  client: ClientInstance<'organization'>,
  sessionId: string,
  quoteId: string,
  projectId?: string,
  options: RequestOptions = {},
): Promise<PlatformResult<NumberTierChange>> {
  const response = await client.sessions.setTierOverride(
    sessionId,
    {quoteId, ...(projectId === undefined ? {} : {projectId})},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function retrieveTierChange(
  client: ClientInstance<'organization'>,
  sessionId: string,
  quoteId: string,
): Promise<PlatformResult<NumberTierChange>> {
  const response = await client.sessions.retrieveTierChange(sessionId, quoteId)
  return result(response.data.data, response.metadata)
}

export async function listHybridMergeCandidates(
  client: ClientInstance<'organization'>,
  projectId: string,
): Promise<PlatformResult<readonly HybridMergeCandidate[]>> {
  const response = await client.projects.listHybridMergeCandidates(projectId)
  return result(response.data.data, response.metadata)
}

export function renderTierChange(
  change: NumberTierChange,
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
  if (next !== undefined) lines.push(next)
  return lines.join('\n')
}

function renderHybridTransition(transition: NumberHybridTransition): string[] {
  const plan =
    transition.action === 'keep'
      ? `keep ${transition.keepTransport} on ${transition.survivingNumberId}; the other connection is disconnected`
      : transition.action === 'split'
        ? `split: ${transition.existingNumberTransport} stays on ${transition.survivingNumberId}; the other connection moves to new Number "${transition.newNumberName}"${transition.newNumberId === undefined ? '' : ` (${transition.newNumberId})`}`
        : `merge ${transition.absorbNumberId} into ${transition.survivingNumberId}`
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

export function renderMergeCandidates(
  candidates: readonly HybridMergeCandidate[],
): string {
  if (candidates.length === 0) return 'No same-number pairs found.'
  return candidates
    .map((candidate) =>
      [
        ...candidate.numbers.map(
          (number) =>
            `${number.id} (${number.name}, ${number.transport}, ${number.status})`,
        ),
        candidate.eligible
          ? 'eligible'
          : `ineligible: ${candidate.ineligibleReason ?? 'unknown'}`,
      ].join('\t'),
    )
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
