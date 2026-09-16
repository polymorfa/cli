import {describe, expect, test} from 'vitest'

import {
  parseBoundedDurationSeconds,
  parseDurationMilliseconds,
  parseDurationSeconds,
  parsePositiveDurationMilliseconds,
} from '../../src/input/duration.js'

describe('duration input', () => {
  test.each([
    ['250ms', 250],
    ['30s', 30_000],
    ['5m', 300_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
  ])('parses %s', (value, expected) => {
    expect(parseDurationMilliseconds(value)).toBe(expected)
  })

  test('requires whole seconds for server overlap windows', () => {
    expect(parseDurationSeconds('1h')).toBe(3600)
    expect(() => parseDurationSeconds('1500ms')).toThrow(
      'whole number of seconds',
    )
  })

  test('supports command-specific positive and bounded durations', () => {
    expect(parsePositiveDurationMilliseconds('1ms')).toBe(1)
    expect(() => parsePositiveDurationMilliseconds('0s')).toThrow(
      'greater than zero',
    )
    expect(parseBoundedDurationSeconds('24h', 86_400)).toBe(86_400)
    expect(() => parseBoundedDurationSeconds('2d', 86_400)).toThrow('at most')
  })
})
