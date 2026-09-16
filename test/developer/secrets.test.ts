import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PassThrough} from 'node:stream'

import {afterEach, describe, expect, test} from 'vitest'

import {prepareOneTimeSecretDelivery} from '../../src/developer/secrets.js'

describe('one-time secret delivery', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, {force: true, recursive: true})
  })

  test('requires a private output file for JSON and noninteractive output', async () => {
    await expect(
      prepareOneTimeSecretDelivery({interactive: false, json: true}),
    ).rejects.toThrow('--secret-out')
  })

  test('rejects an explicitly empty output path', async () => {
    await expect(
      prepareOneTimeSecretDelivery({
        interactive: false,
        json: true,
        path: '',
      }),
    ).rejects.toThrow('must not be empty')
  })

  test('preflights and atomically writes a new private file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-secret-'))
    const path = join(directory, 'webhook.secret')
    const delivery = await prepareOneTimeSecretDelivery({
      interactive: false,
      json: true,
      path,
    })

    expect(delivery).toMatchObject({mode: 'file', path})

    await expect(delivery.deliver('pmfa_whsec_value')).resolves.toEqual({
      mode: 'file',
      path,
      written: true,
    })
    await expect(readFile(path, 'utf8')).resolves.toBe('pmfa_whsec_value\n')
  })

  test('reveals once only through the interactive diagnostic stream', async () => {
    const output = new PassThrough()
    let written = ''
    output.on('data', (chunk: unknown) => {
      written += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    })
    const delivery = await prepareOneTimeSecretDelivery({
      interactive: true,
      json: false,
      output,
    })

    expect(delivery).toMatchObject({mode: 'tty'})

    await expect(delivery.deliver('pmfa_whsec_value')).resolves.toEqual({
      mode: 'tty',
      written: true,
    })
    expect(written).toContain('pmfa_whsec_value')
  })

  test('reports an unavailable replay without writing a placeholder', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-secret-'))
    const path = join(directory, 'webhook.secret')
    const delivery = await prepareOneTimeSecretDelivery({
      interactive: false,
      json: true,
      path,
    })

    await expect(delivery.deliver(null)).resolves.toEqual({
      mode: 'file',
      path,
      written: false,
    })
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({code: 'ENOENT'})
  })
})
