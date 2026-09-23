import {Flags} from '@oclif/core'

export const paginationFlags = {
  cursor: Flags.string({description: 'Continue from this opaque cursor.'}),
  limit: Flags.integer({
    default: 25,
    description: 'Request this many resources per page.',
    max: 100,
    min: 1,
  }),
  'max-items': Flags.integer({
    description: 'Stop automatic pagination after this many resources.',
    max: 10_000,
    min: 1,
  }),
  paginate: Flags.boolean({
    description:
      'Request consecutive pages until --max-items resources are collected or no pages remain. Requires --max-items.',
  }),
}

export const idempotencyFlag = Flags.string({
  description:
    'Use this key to identify retries; one is generated when omitted.',
})

export const yesFlag = Flags.boolean({
  description: 'Confirm the external effect without prompting.',
})

/** Filters shared by the call statistics and call export commands. */
export const callFilterFlags = {
  direction: Flags.string({
    description: 'Include only inbound or outbound calls.',
    options: ['inbound', 'outbound'],
  }),
  outcome: Flags.string({
    description:
      'Include only calls with this outcome. answered includes answered calls still in progress; in_progress means still ringing.',
    options: ['answered', 'missed', 'declined', 'failed', 'in_progress'],
  }),
  session: Flags.string({
    description: 'Include only calls on this session (number).',
  }),
  since: Flags.string({
    description: 'Include calls that started at or after this RFC 3339 time.',
  }),
  until: Flags.string({
    description: 'Include calls that started before this RFC 3339 time.',
  }),
  upstream: Flags.string({
    description: 'Include only numbers that connect this way.',
    options: ['linked_device', 'cloud_api'],
  }),
}
