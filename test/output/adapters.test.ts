import {describe, expect, test} from 'vitest'

import {outputRequest, operationStatusUrl} from '../../src/output/adapters.js'

describe('output adapters', () => {
  test('normalizes SDK response metadata to stable nullable keys', () => {
    expect(outputRequest({attempts: 1, headers: {}, status: 200})).toEqual({
      apiVersion: null,
      id: null,
      status: 200,
    })
  })

  test('builds owner-specific operation URLs without credentials', () => {
    expect(
      operationStatusUrl(
        'https://user:password@api.example.test',
        'project',
        'project/1',
        'operation/1',
      ),
    ).toBe(
      'https://api.example.test/v1/projects/project%2F1/operations/operation%2F1',
    )
  })

  test('matches SDK root-relative routing for a base URL pathname prefix', () => {
    expect(
      operationStatusUrl(
        'https://gateway.example.test/polymorfa/api/?ignored=true',
        'organization',
        undefined,
        'operation/1',
      ),
    ).toBe('https://gateway.example.test/v1/operations/operation%2F1')
  })
})
