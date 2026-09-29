import {
  type ClientInstance,
  PolymorfaServerError,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import {terminalText} from '../developer/render.js'
import type {PlatformResult} from './platform-management.js'

// `GET /platform/referral`. The pinned SDK does not yet have a typed
// `client.referral.retrieve()`; until it is published (polymorfa/sdks
// `t3code/referrals`), this reads the route through the SDK's raw client and
// validates the response shape here. Replace with the typed method once the
// CLI pins an SDK build that includes it.

export interface ReferralWelcomeBonus {
  readonly percent: number
  /** Decimal string, such as `"5000"`. */
  readonly capCredits: string
}

export interface ReferralTier {
  readonly minReferrals: number
  readonly percent: number
}

export interface Referral {
  readonly code: string
  readonly link: string
  readonly enabled: boolean
  readonly welcomeBonus: ReferralWelcomeBonus
  readonly tiers: readonly ReferralTier[]
  /** Decimal string, such as `"10000"`. */
  readonly rewardCapCredits: string
  readonly holdDays: number
  readonly groupShareEnabled: boolean
}

export async function getReferral(
  client: ClientInstance<'organization'>,
): Promise<PlatformResult<Referral>> {
  const response = await client.raw.request<unknown>({
    method: 'GET',
    path: '/platform/referral',
  })
  const data = isRecord(response.data) ? response.data.data : undefined
  if (!isReferral(data)) throw invalidResponse(response.data, response.metadata)
  return {
    data,
    metadata: {
      attempts: response.metadata.attempts,
      status: response.metadata.status,
      ...(response.metadata.apiVersion === undefined
        ? {}
        : {apiVersion: response.metadata.apiVersion}),
      ...(response.metadata.requestId === undefined
        ? {}
        : {requestId: response.metadata.requestId}),
    },
  }
}

export function renderReferralLink(referral: Referral): string {
  return terminalText(referral.link)
}

function isReferral(value: unknown): value is Referral {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.link === 'string' &&
    typeof value.enabled === 'boolean' &&
    isRecord(value.welcomeBonus) &&
    typeof value.welcomeBonus.percent === 'number' &&
    typeof value.welcomeBonus.capCredits === 'string' &&
    Array.isArray(value.tiers) &&
    value.tiers.every(
      (tier) =>
        isRecord(tier) &&
        typeof tier.minReferrals === 'number' &&
        typeof tier.percent === 'number',
    ) &&
    typeof value.rewardCapCredits === 'string' &&
    typeof value.holdDays === 'number' &&
    typeof value.groupShareEnabled === 'boolean'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(
  details: unknown,
  metadata: ResponseMetadata,
): PolymorfaServerError {
  return new PolymorfaServerError(
    'The Polymorfa API returned an invalid referral response.',
    {
      code: 'invalid_response',
      details,
      metadata,
      status: metadata.status,
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  )
}
