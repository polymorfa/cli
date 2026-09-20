import type {ClientInstance, RawRequest} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {
  IMPORT_BATCH_SIZE,
  importCallOptOuts,
  importFormat,
  parseCountryCodes,
  parseImportEntries,
  renderCallCheck,
  renderCallOptOuts,
  renderCallPermission,
  type CallCheck,
  type CallOptOutImportResult,
  type CallPermission,
} from '../../src/services/call-consent.js'

describe('parseCountryCodes', () => {
  test('splits, drops a leading plus, and keeps the first of each code', () => {
    expect(parseCountryCodes(['44,+1876', ' 44 ', '1'])).toEqual([
      '44',
      '1876',
      '1',
    ])
  })

  test('refuses a code that is not 1 to 4 digits, and an empty list', () => {
    expect(() => parseCountryCodes(['44,12345'])).toThrow('1 to 4 digits')
    expect(() => parseCountryCodes([','])).toThrow('--clear')
    expect(() =>
      parseCountryCodes([
        Array.from({length: 301}, (_, index) => String(index + 1000)).join(','),
      ]),
    ).toThrow('at most 300 country codes')
  })
})

describe('importFormat', () => {
  test('prefers the flag, then the file extension', () => {
    expect(importFormat('list.txt', 'csv')).toBe('csv')
    expect(importFormat('LIST.CSV', undefined)).toBe('csv')
    expect(importFormat('list.json', undefined)).toBe('json')
    expect(() => importFormat('-', undefined)).toThrow('--format csv')
  })
})

describe('parseImportEntries', () => {
  test('reads a CSV header in any spelling, with quoted cells and CRLF rows', () => {
    const entries = parseImportEntries(
      '﻿Phone Number,note,bsuid\r\n+14155550123,"Called, twice",\r\n\r\n,,US.1349\r\n',
      'csv',
    )

    expect(entries).toEqual([
      {line: 2, note: 'Called, twice', phoneNumber: '+14155550123'},
      {bsuid: 'US.1349', line: 4},
    ])
  })

  test('refuses CSV input the API could not interpret', () => {
    expect(() => parseImportEntries('email\n a@b.c\n', 'csv')).toThrow(
      'Unknown CSV column "email"',
    )
    expect(() => parseImportEntries('note\nhello\n', 'csv')).toThrow(
      'must name a phoneNumber or bsuid column',
    )
    expect(() =>
      parseImportEntries('phoneNumber,phone\n+1,+1\n', 'csv'),
    ).toThrow('names a column twice')
    expect(() =>
      parseImportEntries('phoneNumber\n+14155550123,extra\n', 'csv'),
    ).toThrow('more cells than the header row')
    expect(() => parseImportEntries('phoneNumber\n"open\n', 'csv')).toThrow(
      'unterminated quoted field',
    )
    expect(() => parseImportEntries('phoneNumber\n', 'csv')).toThrow(
      'no entries',
    )
  })

  test('reads a JSON array or an entries object and refuses anything else', () => {
    expect(
      parseImportEntries(
        '[{"phoneNumber":"+14155550123","note":"asked"}]',
        'json',
      ),
    ).toEqual([{note: 'asked', phoneNumber: '+14155550123'}])
    expect(
      parseImportEntries('{"entries":[{"bsuid":"US.1349"}]}', 'json'),
    ).toEqual([{bsuid: 'US.1349'}])
    expect(() => parseImportEntries('{"phoneNumber":"+1"}', 'json')).toThrow(
      'must be an array of entries',
    )
    expect(() => parseImportEntries('[{"phone":"+1"}]', 'json')).toThrow(
      'has unknown field "phone"',
    )
    expect(() => parseImportEntries('[{"phoneNumber":1}]', 'json')).toThrow(
      'must be a string',
    )
    expect(() => parseImportEntries('["+1"]', 'json')).toThrow(
      'must be an object',
    )
    expect(() => parseImportEntries('nope', 'json')).toThrow('valid JSON')
  })
})

describe('importCallOptOuts', () => {
  test('rejects over-long fields locally and maps API rejections to file positions', async () => {
    const requests: RawRequest[] = []
    const client = fakeClient(requests, {
      added: 1,
      existing: 1,
      rejected: [{index: 1, reason: 'invalid_bsuid'}],
    })

    const progress = await importCallOptOuts(
      client,
      [
        {line: 2, phoneNumber: '+14155550123'},
        {bsuid: 'US.1349', line: 3},
        {line: 4, note: 'n'.repeat(1001), phoneNumber: '+14155550124'},
        {line: 5, phoneNumber: `+${'9'.repeat(64)}`},
        {line: 6, phoneNumber: '+14155550125'},
      ],
      {batchSize: 2},
    )

    expect(requests).toHaveLength(2)
    expect(progress.error).toBeUndefined()
    expect(progress.summary).toEqual({
      added: 2,
      batches: 2,
      entries: 5,
      existing: 2,
      rejected: [
        {index: 1, line: 3, reason: 'invalid_bsuid'},
        {index: 2, line: 4, reason: 'invalid_note'},
        {index: 3, line: 5, reason: 'invalid_phone_number'},
      ],
    })
  })

  test('keeps the batches it stored when a later request fails', async () => {
    const requests: RawRequest[] = []
    const failure = new Error('The list is full.')
    const client = fakeClient(
      requests,
      {added: 1, existing: 0, rejected: []},
      failure,
    )

    const progress = await importCallOptOuts(
      client,
      [{phoneNumber: '+14155550123'}, {phoneNumber: '+14155550124'}],
      {batchSize: 1},
    )

    expect(progress.error).toBe(failure)
    expect(progress.summary.added).toBe(1)
    expect(progress.summary.batches).toBe(1)
    expect(progress.metadata).toEqual({attempts: 1, status: 200})
  })

  test('sends at most 5,000 entries per request by default', () => {
    expect(IMPORT_BATCH_SIZE).toBe(5000)
  })
})

describe('rendering', () => {
  test('names the page cursor, or the --max-items stop, under the entries', () => {
    const entry = {
      bsuid: null,
      createdAt: '2026-09-19T10:00:00.000Z',
      id: 'opt_1',
      note: null,
      phoneNumber: '+14155550123',
      source: 'import' as const,
    }

    expect(renderCallOptOuts([], {hasMore: false, nextCursor: null})).toBe(
      'No do-not-call entries found.',
    )
    expect(
      renderCallOptOuts([entry], {hasMore: true, nextCursor: 'opt_2'}),
    ).toContain('More entries: --cursor opt_2')
    expect(
      renderCallOptOuts([entry], {hasMore: true, nextCursor: null}),
    ).toContain('stopped at --max-items')
  })

  test('says when a permission is the stored state rather than WhatsApp’s answer', () => {
    const permission: CallPermission = {
      actions: null,
      checkedAt: '2026-09-18T10:00:00.000Z',
      conversation: {id: '750000000001'},
      expiresAt: null,
      fresh: false,
      source: 'sync',
      status: 'permanent',
      updatedAt: '2026-09-18T10:00:00.000Z',
    }

    const rendered = renderCallPermission(permission)

    expect(rendered).toContain('Person\t750000000001')
    expect(rendered).toContain(
      'Checked with WhatsApp\tno, stored state (last checked 2026-09-18T10:00:00.000Z)',
    )
    expect(rendered).not.toContain('Request permission')
  })

  test('says a linked-device number does not use call permissions', () => {
    const check: CallCheck = {
      allowed: false,
      permission: null,
      refusal: 'calls_disabled',
    }

    expect(renderCallCheck(check)).toBe(
      [
        'Allowed\tno',
        'Refusal\tcalls_disabled',
        'Call permission\tnot used on linked-device numbers',
      ].join('\n'),
    )
  })
})

function fakeClient(
  requests: RawRequest[],
  result: CallOptOutImportResult,
  failAfterFirst?: Error,
): ClientInstance<'organization'> {
  return {
    raw: {
      request(request: RawRequest) {
        requests.push(request)
        if (failAfterFirst !== undefined && requests.length > 1) {
          return Promise.reject(failAfterFirst)
        }
        return Promise.resolve({
          data: {data: result},
          metadata: {attempts: 1, headers: {}, status: 200},
        })
      },
    },
  } as unknown as ClientInstance<'organization'>
}
