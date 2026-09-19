import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaPaymentRequiredError,
} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {presentError} from '../../src/errors/present.js'
import {
  EventFilterError,
  CheckpointError,
} from '../../src/listener/checkpoint.js'
import {ListenerProtocolError} from '../../src/listener/sse.js'

describe('presentError', () => {
  test('preserves the SDK category without exposing a credential value', () => {
    const error = new PolymorfaConfigurationError(
      'Credential pmfa_secret-value is invalid.',
      'credential',
    )

    expect(presentError(error, ['pmfa_secret-value'])).toEqual({
      category: 'configuration',
      code: 'configuration_error',
      exitCode: 2,
      message: 'Credential [REDACTED] is invalid.',
      retryable: false,
    })
  })

  test('uses the internal category for an unknown error', () => {
    expect(presentError(new Error('socket exploded'))).toEqual({
      category: 'internal',
      code: 'internal_error',
      exitCode: 1,
      message: 'socket exploded',
      retryable: false,
    })
  })

  test('uses the cancellation exit code for an interrupted SDK request', () => {
    expect(
      presentError(new PolymorfaCancelledError('Request cancelled.')),
    ).toEqual({
      category: 'cancelled',
      code: 'cancelled_error',
      exitCode: 130,
      message: 'Request cancelled.',
      retryable: false,
    })
  })

  test('preserves a public SDK request ID', () => {
    const error = new PolymorfaAuthenticationError('Invalid API key.', {
      requestId: 'req_123',
    })

    expect(presentError(error)).toEqual({
      category: 'authentication',
      code: 'authentication_error',
      exitCode: 3,
      message: 'Invalid API key.',
      requestId: 'req_123',
      retryable: false,
    })
  })

  test('preserves listener protocol codes and classifies local validation', () => {
    expect(
      presentError(
        new ListenerProtocolError('listener_invalid_frame', 'Bad frame.'),
      ),
    ).toMatchObject({
      category: 'stream',
      code: 'listener_invalid_frame',
      exitCode: 1,
    })
    expect(presentError(new EventFilterError('Bad filters.'))).toMatchObject({
      category: 'validation',
      code: 'listener_filter_invalid',
      exitCode: 2,
    })
    expect(presentError(new CheckpointError('Bad checkpoint.'))).toMatchObject({
      category: 'validation',
      code: 'listener_checkpoint_invalid',
      exitCode: 2,
    })
  })

  test('keeps retryable listener response categories safe when metadata is absent', () => {
    const error = new ListenerProtocolError(
      'listener_state_unavailable',
      'Listener state is unavailable.',
      {status: 503},
    )

    expect(presentError(error)).toMatchObject({
      category: 'server',
      retryable: true,
    })
  })

  test('keeps the stable API code of a conflict', () => {
    const error = new PolymorfaConflictError(
      'Another participant claimed it.',
      {
        code: 'call_claimed',
        requestId: 'req_409',
      },
    )

    expect(presentError(error)).toEqual({
      category: 'conflict',
      code: 'call_claimed',
      exitCode: 4,
      message: 'Another participant claimed it.',
      requestId: 'req_409',
      retryable: false,
    })
  })

  test('gives voice_not_enabled and gate_limit_reached their own exit codes', () => {
    expect(
      presentError(
        new PolymorfaAuthorizationError('Not enrolled.', {
          code: 'voice_not_enabled',
          status: 403,
        }),
      ),
    ).toMatchObject({
      category: 'authorization',
      code: 'voice_not_enabled',
      exitCode: 6,
    })
    expect(
      presentError(
        new PolymorfaPaymentRequiredError('Limit reached.', {
          code: 'gate_limit_reached',
          status: 402,
        }),
      ),
    ).toMatchObject({
      category: 'payment_required',
      code: 'gate_limit_reached',
      exitCode: 7,
    })
    expect(
      presentError(
        new PolymorfaAuthorizationError('Denied.', {code: 'toString'}),
      ),
    ).toMatchObject({category: 'authorization', exitCode: 3})
  })
})
