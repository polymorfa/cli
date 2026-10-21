import {Flags} from '@oclif/core'
import {
  PolymorfaValidationError,
  type WebhookBatchingInput,
} from '@polymorfa/sdk'

export const batchingFlags = {
  batching: Flags.string({
    options: ['on', 'off'],
    description:
      'Opt in to native webhook batching (beta), or disable it. Enabling requires enrollment; feature_unavailable is preserved.',
  }),
  'batch-max-events': Flags.integer({
    min: 2,
    max: 100,
    description:
      'Batch event limit, 2-100 (default 100). A window may contain one event.',
  }),
  'batch-window-ms': Flags.integer({
    min: 100,
    max: 1000,
    description: 'Batch window, 100-1000 ms (default 1000).',
  }),
}
export interface BatchingFlags {
  readonly batching?: string | undefined
  readonly 'batch-max-events'?: number | undefined
  readonly 'batch-window-ms'?: number | undefined
}
export function withBatching(
  body: Readonly<Record<string, unknown>>,
  flags: BatchingFlags,
): Readonly<Record<string, unknown>> {
  const enabled = flags.batching
  const maxEvents = flags['batch-max-events']
  const windowMs = flags['batch-window-ms']
  if (
    enabled === undefined &&
    maxEvents === undefined &&
    windowMs === undefined
  )
    return body
  const existing = body.batching
  if (
    existing !== undefined &&
    (typeof existing !== 'object' ||
      existing === null ||
      Array.isArray(existing))
  )
    throw new PolymorfaValidationError('batching input must be an object.')
  const previous = (existing ?? {}) as Record<string, unknown>
  const selected = enabled === undefined ? previous.enabled : enabled === 'on'
  if (typeof selected !== 'boolean')
    throw new PolymorfaValidationError(
      'Provide --batching on|off or batching.enabled in --input.',
    )
  const batching: WebhookBatchingInput = {
    ...previous,
    enabled: selected,
    ...(maxEvents === undefined ? {} : {maxEvents}),
    ...(windowMs === undefined ? {} : {windowMs}),
  }
  return {...body, batching}
}
