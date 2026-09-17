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
