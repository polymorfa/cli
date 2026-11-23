import {Readable} from 'node:stream'
import {describe, expect, test} from 'vitest'

import {readSecretFromStdin} from '../../src/input/stdin.js'

describe('readSecretFromStdin', () => {
  test('reads one trimmed secret without returning extra input', async () => {
    await expect(
      readSecretFromStdin(
        Readable.from(['  pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k\n']),
      ),
    ).resolves.toBe('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k')
  })

  test('rejects empty and oversized input', async () => {
    await expect(readSecretFromStdin(Readable.from(['\n']))).rejects.toThrow(
      'Standard input did not contain a credential.',
    )
    await expect(
      readSecretFromStdin(Readable.from(['x'.repeat(65 * 1024)])),
    ).rejects.toThrow('Standard input exceeded 64 KiB.')
  })
})
