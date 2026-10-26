import {Flags} from '@oclif/core'
import {
  PolymorfaValidationError,
  type ClientInstance,
  type MessagingClient,
  type Campaign,
  type RawRequest,
} from '@polymorfa/sdk'
import {terminalText} from '../developer/render.js'
import type {
  CampaignDrip,
  CampaignDripPatch,
  CampaignDripStats,
  CampaignEnrollment,
} from './campaign-drip-types.js'
export type {
  AudienceSegment,
  AudienceSegmentRules,
  AudienceSegmentPreview,
} from './campaign-segment-types.js'
export const dripFlags = {
  drip: Flags.boolean({description: 'Enable drip sequences (beta).'}),
  'drip-enrollment': Flags.string({
    options: ['audience', 'continuous'],
    description: 'Drip enrollment mode. Audience closes continuous enrollment.',
  }),
  'drip-exit-on-reply': Flags.boolean({
    allowNo: true,
    description: 'Stop remaining steps after a reply.',
  }),
  'drip-exit-on-link-click': Flags.boolean({
    allowNo: true,
    description:
      'Stop remaining steps on tracked-link GET, including preview/scanner GETs.',
  }),
  'remove-drip': Flags.boolean({
    description: 'Remove drip settings from an unlaunched draft.',
  }),
}
interface DripFlags {
  readonly drip?: boolean | undefined
  readonly 'drip-enrollment'?: string | undefined
  readonly 'drip-exit-on-reply'?: boolean | undefined
  readonly 'drip-exit-on-link-click'?: boolean | undefined
  readonly 'remove-drip'?: boolean | undefined
}
export function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new PolymorfaValidationError('Input must be one JSON object.', {
      code: 'invalid_campaign_input',
    })
  return {...(value as Record<string, unknown>)}
}
export function dripInput(
  value: unknown,
  flags: DripFlags,
): Record<string, unknown> {
  const body = objectInput(value)
  const edits: CampaignDripPatch = {
    ...(flags['drip-enrollment'] === undefined
      ? {}
      : {enrollment: flags['drip-enrollment'] as CampaignDrip['enrollment']}),
    ...(flags['drip-exit-on-reply'] === undefined
      ? {}
      : {exitOnReply: flags['drip-exit-on-reply']}),
    ...(flags['drip-exit-on-link-click'] === undefined
      ? {}
      : {exitOnLinkClick: flags['drip-exit-on-link-click']}),
  }
  const hasEdits = flags.drip === true || Object.keys(edits).length > 0
  if (flags['remove-drip'] && (hasEdits || body.drip !== undefined))
    throw new PolymorfaValidationError(
      'Use --remove-drip without other drip settings.',
      {code: 'invalid_campaign_input'},
    )
  if (flags['remove-drip']) body.drip = null
  else if (hasEdits) {
    if (body.drip === null)
      throw new PolymorfaValidationError(
        'Cannot combine null drip with drip flags.',
        {code: 'invalid_campaign_input'},
      )
    body.drip = {
      ...(body.drip === undefined ? {} : objectInput(body.drip)),
      ...edits,
    }
  }
  return body
}
export async function campaignRequest<T>(
  client: ClientInstance<'organization'> | MessagingClient,
  request: RawRequest,
) {
  const response = await client.raw.request<{data: T}>({
    ...request,
    maxNetworkRetries: 0,
  })
  return {data: response.data.data, metadata: response.metadata}
}
export function segmentPath(id?: string) {
  return (
    '/platform/audience-segments' +
    (id === undefined ? '' : '/' + encodeURIComponent(id))
  )
}
export function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new PolymorfaValidationError('Use an observed positive revision.', {
      code: 'invalid_parameter',
    })
  return value
}
export function renderDripConfiguration(value: object): string[] {
  const c = value as {
    drip?: CampaignDrip | null
    enrollmentOpen?: boolean | null
    pauseReason?: string | null
    segmentId?: string | null
    segmentSnapshot?: {
      revision: number
      matchedCount: number
      evaluatedAt: number
    } | null
  }
  return [
    ...(c.segmentId ? [`Segment\t${terminalText(c.segmentId)}`] : []),
    ...(c.segmentSnapshot
      ? [
          `Segment revision\t${c.segmentSnapshot.revision}`,
          `Segment matched\t${c.segmentSnapshot.matchedCount}`,
        ]
      : []),
    ...(c.drip
      ? [
          `Drip enrollment\t${c.drip.enrollment}`,
          `Enrollment\t${c.enrollmentOpen === true ? 'Open' : c.enrollmentOpen === false ? 'Closed' : 'Unknown'}`,
          `Exit on reply\t${c.drip.exitOnReply}`,
          `Exit on link GET\t${c.drip.exitOnLinkClick}`,
        ]
      : []),
    ...(c.pauseReason ? [`Pause reason\t${terminalText(c.pauseReason)}`] : []),
  ]
}
export function renderDripStats(value: object): string[] {
  const {drip} = value as {drip?: CampaignDripStats | null}
  if (!drip) return []
  return [
    `Drip enrolled\t${drip.enrolled}`,
    `Drip active\t${drip.active}`,
    `Drip completed\t${drip.completed}`,
    `Drip exited\t${drip.exited}`,
    'Step\tEntered\tWaiting\tSent\tDelivered\tRead\tReplied\tExited\tFailed',
    ...drip.steps.map((s) =>
      [
        s.step,
        s.entered,
        s.waiting,
        s.sent,
        s.delivered,
        s.read,
        s.replied,
        s.exited,
        s.failed,
      ].join('\t'),
    ),
  ]
}
export type CampaignWithDrip = Campaign & {readonly drip?: CampaignDrip | null}
export type Enrollment = CampaignEnrollment
