import {terminalText} from '../developer/render.js'

/*
 * Campaign A/B tests and weighted message variation (beta).
 *
 * The published SDK pin types these fields as unknown or omits them, so the
 * CLI reads them as unknown values and narrows them here. The shapes follow
 * the SDK's CampaignExperimentResults, CampaignExperimentOutcome,
 * CampaignVariant and CampaignMessageVariation types. A value that does not
 * match is reported as unreadable instead of being printed partially.
 */

export type ExperimentOutcome =
  | {readonly state: 'promoted'; readonly winnerKey: string}
  | {readonly reason: string; readonly state: 'inconclusive'}

export interface ExperimentVariantResult {
  readonly assigned: number
  readonly delivered: number
  readonly key: string
  readonly label: string
  readonly outcomeRate: number
  readonly read: number
  readonly replied: number
  readonly sent: number
  readonly weight: number
}

export interface ExperimentResults {
  readonly criterion: string
  readonly holdoutCount: number
  readonly outcome: ExperimentOutcome | null
  readonly reserveCount: number
  readonly variants: readonly ExperimentVariantResult[]
}

interface VariantSummary {
  readonly key: string
  readonly label: string
}

const UNREADABLE =
  'Unreadable in this CLI version; use --json for the full response.'

const CRITERION_RATE: Readonly<Record<string, string>> = {
  delivery: 'Delivery rate',
  read: 'Read rate',
  reply: 'Reply rate',
}

/** Human lines for `campaign analytics`; empty when the campaign is not an A/B test. */
export function renderExperimentAnalytics(analytics: object): string[] {
  const value = field(analytics, 'experiment')
  if (value === undefined || value === null) return []
  const experiment = experimentResults(value)
  if (experiment === undefined) return ['', `A/B test\t${UNREADABLE}`]

  const rateLabel =
    CRITERION_RATE[experiment.criterion] ??
    `${terminalText(experiment.criterion)} rate`
  const winnerKey =
    experiment.outcome?.state === 'promoted'
      ? experiment.outcome.winnerKey
      : undefined

  return [
    '',
    `A/B criterion\t${rateLabel}`,
    `A/B outcome\t${describeOutcome(experiment.outcome, experiment.variants)}`,
    `Holdout\t${experiment.holdoutCount}`,
    `Reserve\t${experiment.reserveCount}`,
    '',
    [
      'Variant',
      rateLabel,
      'Sent',
      'Assigned',
      'Delivered',
      'Read',
      'Replied',
    ].join('\t'),
    ...experiment.variants.map((variant) =>
      [
        `${variantName(variant)}${variant.key === winnerKey ? ' (winner)' : ''}`,
        percent(variant.outcomeRate),
        variant.sent,
        variant.assigned,
        variant.delivered,
        variant.read,
        variant.replied,
      ].join('\t'),
    ),
  ]
}

/** Human lines for `campaign view` covering A/B variants and weighted alternatives. */
export function renderCampaignBetas(campaign: object): string[] {
  const lines: string[] = []

  const variants = field(campaign, 'variants')
  if (variants !== undefined && variants !== null) {
    const summaries = variantSummaries(variants)
    const outcome = field(campaign, 'experimentOutcome')
    const parsed =
      outcome === undefined || outcome === null
        ? null
        : experimentOutcome(outcome)
    if (summaries === undefined || parsed === undefined) {
      lines.push(`A/B test\t${UNREADABLE}`)
    } else {
      lines.push(
        `A/B test\t${summaries.length} ${summaries.length === 1 ? 'variant' : 'variants'}`,
        `A/B outcome\t${describeOutcome(parsed, summaries)}`,
      )
    }
  }

  const variations = field(campaign, 'messageVariations')
  if (variations !== undefined && variations !== null) {
    lines.push(
      Array.isArray(variations)
        ? `Message variations\t${variations.length} weighted ${variations.length === 1 ? 'alternative' : 'alternatives'}`
        : `Message variations\t${UNREADABLE}`,
    )
  }

  return lines
}

function describeOutcome(
  outcome: ExperimentOutcome | null,
  variants: readonly VariantSummary[],
): string {
  if (outcome === null) return 'No winner yet'
  if (outcome.state === 'promoted') {
    const winner = variants.find((variant) => variant.key === outcome.winnerKey)
    return `Winner: ${winner === undefined ? terminalText(outcome.winnerKey) : variantName(winner)}, promoted to the reserve`
  }
  return `Inconclusive (${terminalText(outcome.reason)}); the reserve was not sent`
}

function variantName(variant: VariantSummary): string {
  return `${terminalText(variant.label)} [${terminalText(variant.key)}]`
}

function percent(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toFixed(1)}%`
}

function experimentResults(value: unknown): ExperimentResults | undefined {
  if (!isRecord(value)) return undefined
  const {criterion, holdoutCount, reserveCount, variants} = value
  const outcome =
    value.outcome === null || value.outcome === undefined
      ? null
      : experimentOutcome(value.outcome)
  if (
    typeof criterion !== 'string' ||
    !isCount(holdoutCount) ||
    !isCount(reserveCount) ||
    outcome === undefined ||
    !Array.isArray(variants)
  ) {
    return undefined
  }
  const results: ExperimentVariantResult[] = []
  for (const variant of variants) {
    const parsed = variantResult(variant)
    if (parsed === undefined) return undefined
    results.push(parsed)
  }
  return {
    criterion,
    holdoutCount,
    outcome,
    reserveCount,
    variants: results,
  }
}

function variantResult(value: unknown): ExperimentVariantResult | undefined {
  if (!isRecord(value)) return undefined
  const {
    assigned,
    delivered,
    key,
    label,
    outcomeRate,
    read,
    replied,
    sent,
    weight,
  } = value
  if (
    typeof key !== 'string' ||
    typeof label !== 'string' ||
    !isFiniteNumber(outcomeRate) ||
    !isFiniteNumber(weight) ||
    ![assigned, delivered, read, replied, sent].every(isCount)
  ) {
    return undefined
  }
  return {
    assigned: assigned as number,
    delivered: delivered as number,
    key,
    label,
    outcomeRate,
    read: read as number,
    replied: replied as number,
    sent: sent as number,
    weight,
  }
}

function experimentOutcome(value: unknown): ExperimentOutcome | undefined {
  if (!isRecord(value)) return undefined
  if (value.state === 'promoted' && typeof value.winnerKey === 'string') {
    return {state: 'promoted', winnerKey: value.winnerKey}
  }
  if (value.state === 'inconclusive' && typeof value.reason === 'string') {
    return {reason: value.reason, state: 'inconclusive'}
  }
  return undefined
}

function variantSummaries(value: unknown): VariantSummary[] | undefined {
  if (!Array.isArray(value)) return undefined
  const summaries: VariantSummary[] = []
  for (const variant of value) {
    if (
      !isRecord(variant) ||
      typeof variant.key !== 'string' ||
      typeof variant.label !== 'string'
    ) {
      return undefined
    }
    summaries.push({key: variant.key, label: variant.label})
  }
  return summaries
}

function field(value: object, name: string): unknown {
  return (value as Readonly<Record<string, unknown>>)[name]
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
