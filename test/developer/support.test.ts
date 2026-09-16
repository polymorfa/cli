import {describe, expect, test} from 'vitest'

import {assertCursorNotCombined} from '../../src/developer/support.js'

describe('developer command support', () => {
  test('rejects filters combined with an opaque cursor', () => {
    expect(() =>
      assertCursorNotCombined('cursor_1', [undefined, 'failed']),
    ).toThrow('cursor')
    expect(() => assertCursorNotCombined('cursor_1', [undefined])).not.toThrow()
    expect(() => assertCursorNotCombined(undefined, ['failed'])).not.toThrow()
  })
})
