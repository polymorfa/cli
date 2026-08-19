import {
  PolymorfaAuthenticationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {presentError} from '../../src/errors/present.js'

describe('presentError', () => {
  test('preserves the SDK category without exposing a credential value', () => {
    const error = new PolymorfaConfigurationError(
      'Credential pmfa_secret-value is invalid.',
      'credential',
    )

    expect(presentError(error, ['pmfa_secret-value'])).toEqual({
      category: 'configuration',
      exitCode: 2,
      message: 'Credential [REDACTED] is invalid.',
    })
  })

  test('uses the internal category for an unknown error', () => {
    expect(presentError(new Error('socket exploded'))).toEqual({
      category: 'internal',
      exitCode: 1,
      message: 'socket exploded',
    })
  })

  test('uses the cancellation exit code for an interrupted SDK request', () => {
    expect(presentError(new PolymorfaCancelledError('Request cancelled.'))).toEqual(
      {
        category: 'cancelled',
        exitCode: 130,
        message: 'Request cancelled.',
      },
    )
  })

  test('preserves a public SDK request ID', () => {
    const error = new PolymorfaAuthenticationError('Invalid API key.', {
      requestId: 'req_123',
    })

    expect(presentError(error)).toEqual({
      category: 'authentication',
      exitCode: 3,
      message: 'Invalid API key.',
      requestId: 'req_123',
    })
  })
})
