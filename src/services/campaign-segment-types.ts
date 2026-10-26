// Local SDK additions; replace with SDK imports after the accepted prerelease.
export type AudienceSegmentCondition =
  | {
      readonly field: 'tag'
      readonly operator: 'contains'
      readonly value: string
    }
  | {
      readonly field: 'tag'
      readonly operator: 'in'
      readonly values: readonly string[]
    }
  | {readonly field: 'tag'; readonly operator: 'exists'}
  | {
      readonly field: 'attribute'
      readonly name: string
      readonly operator: 'equals'
      readonly value: string | number | boolean
    }
  | {
      readonly field: 'attribute'
      readonly name: string
      readonly operator: 'contains' | 'before' | 'after'
      readonly value: string
    }
  | {
      readonly field: 'attribute'
      readonly name: string
      readonly operator: 'in'
      readonly values: readonly (string | number)[]
    }
  | {
      readonly field: 'attribute'
      readonly name: string
      readonly operator: 'greater_than' | 'less_than'
      readonly value: number
    }
  | {
      readonly field: 'attribute'
      readonly name: string
      readonly operator: 'exists'
    }
  | {
      readonly field: 'consent'
      readonly operator: 'equals'
      readonly value: boolean
    }
  | {
      readonly field: 'campaign'
      readonly campaignId: string
      readonly outcome:
        | 'delivered'
        | 'not_delivered'
        | 'read'
        | 'not_read'
        | 'replied'
        | 'not_replied'
        | 'failed'
    }

/** At most 10 groups, 20 conditions/group, 40 total, 5 campaign conditions,
 * 50 values per `in`, and 16 KiB. Missing, null or wrong-type attributes do not match. */
export interface AudienceSegmentRules {
  readonly match: 'all' | 'any'
  readonly groups: readonly {
    readonly match: 'all' | 'any'
    readonly negate?: boolean
    readonly conditions: readonly AudienceSegmentCondition[]
  }[]
}
export interface AudienceSegment {
  readonly id: string
  readonly name: string
  readonly revision: number
  readonly rules: AudienceSegmentRules
  readonly createdAt: number
  readonly updatedAt: number
}
export interface AudienceSegmentPreview {
  readonly matchedCount: number
  readonly optedOutCount: number
  readonly consentWithheldCount: number
  readonly eligibleCount: number
  readonly sample: readonly {
    readonly phone: string
    readonly tags: readonly string[]
  }[]
  readonly evaluatedAt: number
}
export interface SavedAudienceSegmentPreview extends AudienceSegmentPreview {
  readonly revision: number
}
export interface CreateAudienceSegmentRequest {
  readonly name: string
  readonly rules: AudienceSegmentRules
}
export interface UpdateAudienceSegmentRequest {
  readonly expectedRevision: number
  readonly name?: string
  readonly rules?: AudienceSegmentRules
}
export interface ListAudienceSegmentsParams {
  readonly cursor?: string
  readonly limit?: number
}
export interface AudienceSegmentsEnvelope {
  readonly data: readonly AudienceSegment[]
  readonly page: {
    readonly hasMore: boolean
    readonly nextCursor: string | null
  }
}
