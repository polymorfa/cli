import {describe, expect, test} from 'vitest'

import {developerMutation} from '../../src/developer/output.js'

const base = {
  baseUrl: 'https://api.example.test',
  context: {
    owner: 'organization' as const,
    principalType: 'organization_key' as const,
  },
  metadata: {attempts: 1, headers: {}, status: 200},
  resource: null,
}

describe('developer mutation output', () => {
  test('requires a complete idempotency receipt', () => {
    expect(() =>
      developerMutation({
        ...base,
        receipt: {
          idempotency: {id: 'receipt_1', key: 'key_1', replayed: false},
          operationId: null,
        },
      }),
    ).not.toThrow()

    expect(() =>
      developerMutation({
        ...base,
        receipt: {
          idempotency: {id: 'receipt_1', key: '', replayed: false},
          operationId: null,
        },
      }),
    ).toThrow('key')
    expect(() =>
      developerMutation({
        ...base,
        receipt: {
          idempotency: {id: 'receipt_1', key: 'key_1'},
          operationId: null,
        },
      }),
    ).toThrow('replayed')
  })
})
