import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import type {Readable} from 'node:stream'

const MAX_SECRET_BYTES = 64 * 1024

export async function readSecretFromStdin(
  input: Readable = process.stdin,
): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.byteLength
    if (bytes > MAX_SECRET_BYTES) {
      throw new PolymorfaConfigurationError(
        'Standard input exceeded 64 KiB.',
        'stdin',
      )
    }

    chunks.push(buffer)
  }

  const credential = Buffer.concat(chunks).toString('utf8').trim()
  if (credential.length === 0) {
    throw new PolymorfaConfigurationError(
      'Standard input did not contain an API key.',
      'stdin',
    )
  }

  return credential
}
