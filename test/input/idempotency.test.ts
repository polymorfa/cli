import {describe, expect, test} from 'vitest'

import {idempotencyKey} from '../../src/input/idempotency.js'

describe('idempotency keys', () => {
  test('preserves a caller key and generates a stable CLI-shaped key otherwise', () => {
    expect(idempotencyKey(' caller-key ')).toBe('caller-key')
    expect(idempotencyKey(undefined, () => '1234')).toBe('pmfa_cli_1234')
  })

  test('rejects an explicitly empty or whitespace key instead of generating one', () => {
    const generate = () => 'must-not-be-used'
    expect(() => idempotencyKey('', generate)).toThrow('must not be empty')
    expect(() => idempotencyKey('  \t ', generate)).toThrow('must not be empty')
  })

  test('rejects keys longer than the 255-byte wire contract', () => {
    expect(() => idempotencyKey('a'.repeat(256))).toThrow('255 bytes')
    expect(() => idempotencyKey('\u00e9'.repeat(128))).toThrow('255 bytes')
  })
})
