import {describe, expect, test} from 'vitest'

import {
  readEnvelope,
  mutationEnvelope,
  errorEnvelope,
} from '../../src/output/contracts.js'

const context = {
  owner: 'project' as const,
  principalType: 'project_token' as const,
  projectId: 'project_1',
}
const request = {apiVersion: '1.0.0', id: 'req_1', status: 200}

describe('machine output contracts', () => {
  test('uses schemaVersion 1 for reads, lists, mutations, and errors', () => {
    expect(readEnvelope({data: {id: 'x'}, context, request})).toEqual({
      schemaVersion: 1,
      data: {id: 'x'},
      context,
      request,
    })
    expect(
      readEnvelope({
        data: [],
        context,
        page: {hasMore: false, nextCursor: null},
        request,
      }),
    ).toMatchObject({schemaVersion: 1, page: {hasMore: false}})
    expect(
      mutationEnvelope({
        context,
        idempotency: null,
        operation: null,
        request,
        resource: null,
        result: {ok: true},
      }),
    ).toMatchObject({schemaVersion: 1, operation: null})
    expect(
      errorEnvelope({
        category: 'conflict',
        code: 'payload_not_replayable',
        context,
        message: 'Unavailable.',
        retryable: false,
      }),
    ).toMatchObject({schemaVersion: 1, error: {code: 'payload_not_replayable'}})
  })
})
