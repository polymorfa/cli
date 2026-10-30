import {readFileSync} from 'node:fs'
import {validateOrganizationApiKey} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {validateProjectToken} from '../../src/config/credentials.js'

// Byte-for-byte copy of #647's public golden vectors. Provenance is recorded in
// docs/opaque-credentials-cutover.md. These are test secrets, never credentials.
const vectors = JSON.parse(
  readFileSync(
    new URL('../fixtures/machine-credentials-v1.json', import.meta.url),
    'utf8',
  ),
) as {opaque: {kind: 'key' | 'project'; token: string}[]}

describe('canonical API credential vectors through the published SDK', () => {
  for (const fixture of vectors.opaque) {
    test(`accepts the ${fixture.kind} vector without rewriting its opaque bytes`, () => {
      const validate =
        fixture.kind === 'key'
          ? validateOrganizationApiKey
          : validateProjectToken
      expect(validate(fixture.token)).toBe(fixture.token)
      const changed = `${fixture.token.slice(0, -1)}A`
      expect(() => validate(changed)).toThrow()
    })
  }
})
