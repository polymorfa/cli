import {describe, expect, test} from 'vitest'

import {optionalTimeRange} from '../../src/input/time.js'

describe('time filters', () => {
  test('accepts RFC 3339 timestamps and preserves their exact text', () => {
    expect(
      optionalTimeRange('2026-08-20T10:15:30Z', '2026-08-20T11:15:30+00:00'),
    ).toEqual({
      since: '2026-08-20T10:15:30Z',
      until: '2026-08-20T11:15:30+00:00',
    })
  })

  test('rejects loose dates and non-increasing ranges', () => {
    expect(() => optionalTimeRange('2026-08-20', undefined)).toThrow('RFC 3339')
    expect(() =>
      optionalTimeRange('2026-08-20T11:15:30Z', '2026-08-20T10:15:30Z'),
    ).toThrow('after')
  })
})
