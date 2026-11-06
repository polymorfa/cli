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

describe('strict UTF-8 input', () => {
  test('refuses malformed stdin bytes rather than replacing them', async () => {
    const input = Readable.from([Buffer.from([0xff])])
    await expect(
      readTextInput('-', input, {strictUtf8: true}),
    ).rejects.toMatchObject({
      code: 'invalid_utf8_input',
      message: 'API input must contain valid UTF-8.',
    })
  })
  test('preserves a BOM, CRLF and UTF-8 split across stdin chunks', async () => {
    const input = Readable.from([
      Buffer.from([0xef, 0xbb, 0xbf, 0xc3]),
      Buffer.from([0xa9, 0x0d, 0x0a]),
    ])
    await expect(readTextInput('-', input, {strictUtf8: true})).resolves.toBe(
      '\uFEFFé\r\n',
    )
  })
  test('keeps existing replacement decoding for callers without the strict option', async () => {
    await expect(
      readTextInput('-', Readable.from([Buffer.from([0xff])])),
    ).resolves.toBe('\uFFFD')
  })
})
