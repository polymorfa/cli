import {Readable} from 'node:stream'
import {describe, expect, test} from 'vitest'

import {readJsonInput, readTextInput} from '../../src/api/request.js'

describe('readJsonInput', () => {
  test('reads one JSON value from standard input', async () => {
    const input = Readable.from(['{"name":"From stdin"}'])

    await expect(readJsonInput('-', input)).resolves.toEqual({
      name: 'From stdin',
    })
  })

  test('rejects standard input larger than 10 MiB', async () => {
    const input = Readable.from([Buffer.alloc(10 * 1024 * 1024 + 1, 32)])

    await expect(readJsonInput('-', input)).rejects.toThrow(
      'API input must not exceed 10 MiB.',
    )
  })
})

describe('readTextInput', () => {
  test('reads standard input without parsing it', async () => {
    const input = Readable.from(['phoneNumber\n+14155550123\n'])

    await expect(readTextInput('-', input)).resolves.toBe(
      'phoneNumber\n+14155550123\n',
    )
  })

  test('rejects standard input larger than 10 MiB', async () => {
    const input = Readable.from([Buffer.alloc(10 * 1024 * 1024 + 1, 32)])

    await expect(readTextInput('-', input)).rejects.toThrow(
      'API input must not exceed 10 MiB.',
    )
  })
})
