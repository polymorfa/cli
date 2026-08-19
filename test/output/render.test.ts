import {describe, expect, test} from 'vitest'

import {renderValue} from '../../src/output/render.js'

describe('renderValue', () => {
  test('rejects undefined instead of emitting invalid JSON', () => {
    expect(() => renderValue(undefined, 'json')).toThrow(
      'Cannot render undefined as JSON.',
    )
  })
})
