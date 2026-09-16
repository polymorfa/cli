import {randomUUID} from 'node:crypto'
import {PolymorfaValidationError} from '@polymorfa/sdk'

export function idempotencyKey(
  value: string | undefined,
  generate: () => string = randomUUID,
): string {
  const supplied = value?.trim()
  const key =
    supplied && supplied.length > 0 ? supplied : `pmfa_cli_${generate()}`
  if (Buffer.byteLength(key, 'utf8') > 255) {
    throw new PolymorfaValidationError(
      'Idempotency keys must not exceed 255 bytes.',
      {code: 'invalid_idempotency_key'},
    )
  }
  return key
}
