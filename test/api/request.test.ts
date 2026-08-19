import {Readable} from 'node:stream'
import {describe, expect, test} from 'vitest'

import {readJsonInput} from '../../src/api/request.js'

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
