import {describe, expect, test} from 'vitest'

import {outputRequest} from '../../src/output/adapters.js'

describe('output adapters', () => {
  test('normalizes SDK response metadata to stable nullable keys', () => {
    expect(outputRequest({attempts: 1, headers: {}, status: 200})).toEqual({
      apiVersion: null,
      id: null,
      status: 200,
    })
  })
})
