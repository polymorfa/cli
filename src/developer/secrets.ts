import {PolymorfaValidationError} from '@polymorfa/sdk'
import type {Writable} from 'node:stream'

import {prepareSecretFile} from '../security/secret-file.js'

export interface SecretDeliveryResult {
  readonly mode: 'file' | 'tty'
  readonly path?: string
  readonly written: boolean
}

export interface PreparedOneTimeSecretDelivery {
  readonly mode: 'file' | 'tty'
  readonly path?: string
  deliver(secret: string | null): Promise<SecretDeliveryResult>
}

export async function prepareOneTimeSecretDelivery(input: {
  readonly interactive?: boolean
  readonly json: boolean
  readonly output?: Writable
  readonly path?: string
}): Promise<PreparedOneTimeSecretDelivery> {
  if (input.path !== undefined) {
    if (input.path.trim().length === 0) {
      throw new PolymorfaValidationError(
        'The secret output path must not be empty.',
        {code: 'secret_output_required'},
      )
    }
    const prepared = await prepareSecretFile(input.path)
    return {
      mode: 'file',
      path: prepared.path,
      async deliver(secret) {
        if (secret === null) {
          return {mode: 'file', path: prepared.path, written: false}
        }
        await prepared.write(secret)
        return {mode: 'file', path: prepared.path, written: true}
      },
    }
  }

  const interactive =
    input.interactive ??
    (process.stdin.isTTY === true && process.stderr.isTTY === true)
  if (input.json || !interactive) {
    throw new PolymorfaValidationError(
      'JSON and noninteractive webhook secret delivery require --secret-out.',
      {code: 'secret_output_required'},
    )
  }

  const output = input.output ?? process.stderr
  return {
    mode: 'tty',
    deliver(secret) {
      if (secret === null)
        return Promise.resolve({mode: 'tty' as const, written: false})
      output.write(`Webhook signing secret (shown once): ${secret}\n`)
      return Promise.resolve({mode: 'tty' as const, written: true})
    },
  }
}
