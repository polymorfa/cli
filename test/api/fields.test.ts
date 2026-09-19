import {describe, expect, test} from 'vitest'

import {parseFields, queryFromFields} from '../../src/api/fields.js'

describe('api fields', () => {
  test('keeps raw fields as strings and types -F values', async () => {
    await expect(
      parseFields([
        {kind: 'raw', value: 'count=10'},
        {kind: 'typed', value: 'limit=10'},
        {kind: 'typed', value: 'enabled=true'},
        {kind: 'typed', value: 'off=false'},
        {kind: 'typed', value: 'gone=null'},
        {kind: 'typed', value: 'ratio=1.5'},
        {kind: 'typed', value: 'big=99999999999999999999'},
        {kind: 'typed', value: 'name=Launch=Day'},
      ]),
    ).resolves.toEqual({
      big: '99999999999999999999',
      count: '10',
      enabled: true,
      gone: null,
      limit: 10,
      name: 'Launch=Day',
      off: false,
      ratio: '1.5',
    })
  })

  test('nests objects and appends arrays', async () => {
    await expect(
      parseFields([
        {kind: 'typed', value: 'audience[tags][]=vip'},
        {kind: 'typed', value: 'audience[tags][]=beta'},
        {kind: 'typed', value: 'audience[size]=3'},
        {kind: 'raw', value: 'ids[]=1'},
      ]),
    ).resolves.toEqual({
      audience: {size: 3, tags: ['vip', 'beta']},
      ids: ['1'],
    })
  })

  test('reads @file and @- values for typed fields only', async () => {
    const readers = {
      readFile: (path: string) => Promise.resolve(`file:${path}`),
      readStdin: () => Promise.resolve('stdin'),
    }
    await expect(
      parseFields(
        [
          {kind: 'typed', value: 'body=@message.txt'},
          {kind: 'typed', value: 'note=@-'},
          {kind: 'raw', value: 'literal=@kept'},
        ],
        readers,
      ),
    ).resolves.toEqual({
      body: 'file:message.txt',
      literal: '@kept',
      note: 'stdin',
    })
  })

  test('rejects malformed names and shape conflicts', async () => {
    await expect(parseFields([{kind: 'raw', value: '=x'}])).rejects.toThrow(
      'name=value',
    )
    await expect(parseFields([{kind: 'raw', value: 'a[]b=x'}])).rejects.toThrow(
      'Invalid field name',
    )
    await expect(
      parseFields([
        {kind: 'raw', value: 'a=x'},
        {kind: 'raw', value: 'a[b]=y'},
      ]),
    ).rejects.toThrow('conflicts')
  })

  test('rejects prototype keys and overwriting nested values', async () => {
    await expect(
      parseFields([{kind: 'raw', value: 'a[__proto__][polluted]=1'}]),
    ).rejects.toThrow('not allowed')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    await expect(
      parseFields([
        {kind: 'raw', value: 'a[b]=x'},
        {kind: 'raw', value: 'a=y'},
      ]),
    ).rejects.toThrow('conflicts')
  })

  test('query parameters accept scalars and arrays but not objects', () => {
    expect(queryFromFields({ids: [1, 'b'], q: 'x', flag: true})).toEqual({
      flag: true,
      ids: [1, 'b'],
      q: 'x',
    })
    expect(() => queryFromFields({filter: {a: 1}})).toThrow('nested')
  })
})
