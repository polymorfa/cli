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

  test('rejects nonexistent calendar dates and out-of-range times', () => {
    for (const value of [
      '2026-02-29T00:00:00Z',
      '2026-02-30T00:00:00Z',
      '2026-04-31T00:00:00Z',
      '2026-00-10T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:00+24:00',
    ]) {
      expect(() => optionalTimeRange(value, undefined)).toThrow('RFC 3339')
    }
    expect(optionalTimeRange('2028-02-29T23:59:59.5-05:30', undefined)).toEqual(
      {
        since: '2028-02-29T23:59:59.5-05:30',
      },
    )
  })

  test('rejects loose dates and non-increasing ranges', () => {
    expect(() => optionalTimeRange('2026-08-20', undefined)).toThrow('RFC 3339')
    expect(() =>
      optionalTimeRange('2026-08-20T11:15:30Z', '2026-08-20T10:15:30Z'),
    ).toThrow('after')
  })
})
