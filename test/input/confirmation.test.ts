import {PassThrough, Readable} from 'node:stream'

import {describe, expect, test} from 'vitest'

import {confirmDangerous} from '../../src/input/confirmation.js'

describe('dangerous confirmations', () => {
  test('accepts --yes without touching terminal input', async () => {
    await expect(
      confirmDangerous({prompt: 'Delete?', yes: true}),
    ).resolves.toBeUndefined()
  })

  test('requires --yes outside a TTY', async () => {
    const input = Readable.from([]) as Readable & {isTTY?: boolean}
    input.isTTY = false
    const output = new PassThrough() as PassThrough & {isTTY?: boolean}
    output.isTTY = false

    await expect(
      confirmDangerous({input, output, prompt: 'Delete?', yes: false}),
    ).rejects.toThrow('--yes')
  })

  test('accepts an explicit yes from an interactive terminal', async () => {
    const input = Readable.from(['yes\n']) as Readable & {isTTY?: boolean}
    input.isTTY = true
    const output = new PassThrough() as PassThrough & {isTTY?: boolean}
    output.isTTY = true

    await expect(
      confirmDangerous({input, output, prompt: 'Delete?', yes: false}),
    ).resolves.toBeUndefined()
  })
})
