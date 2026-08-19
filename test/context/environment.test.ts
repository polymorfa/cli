import {describe, expect, test} from 'vitest'

import {resolveEnvironment} from '../../src/context/environment.js'

describe('resolveEnvironment', () => {
  test('resolves a platform server key without returning unrelated environment values', () => {
    expect(
      resolveEnvironment({
        env: {
          POLYMORFA_API_KEY: 'pmfa_test-key',
          POLYMORFA_BASE_URL: 'http://127.0.0.1:4567',
          UNRELATED_SECRET: 'do-not-copy',
        },
        surface: 'platform',
        timeoutMs: 5000,
      }),
    ).toEqual({
      surface: 'platform',
      credential: {type: 'apiKey', value: 'pmfa_test-key'},
      baseUrl: 'http://127.0.0.1:4567',
      timeoutMs: 5000,
    })
  })

  test('rejects a client token for the Platform surface', () => {
    expect(() =>
      resolveEnvironment({
        env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser'},
        surface: 'platform',
      }),
    ).toThrow('Platform API requests require POLYMORFA_API_KEY.')
  })

  test('resolves a client token for the Messaging surface', () => {
    expect(
      resolveEnvironment({
        env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser'},
        surface: 'messaging',
      }),
    ).toEqual({
      surface: 'messaging',
      credential: {type: 'clientToken', value: 'pmfa_ct_browser'},
    })
  })

  test('resolves a server API key for the Messaging surface', () => {
    expect(
      resolveEnvironment({
        env: {POLYMORFA_API_KEY: 'pmfa_test-key'},
        surface: 'messaging',
      }),
    ).toEqual({
      surface: 'messaging',
      credential: {type: 'apiKey', value: 'pmfa_test-key'},
    })
  })

  test('rejects ambiguous Messaging credentials', () => {
    expect(() =>
      resolveEnvironment({
        env: {
          POLYMORFA_API_KEY: 'pmfa_test-key',
          POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
        },
        surface: 'messaging',
      }),
    ).toThrow(
      'Messaging credentials are ambiguous; set only POLYMORFA_API_KEY or POLYMORFA_CLIENT_TOKEN.',
    )
  })
})
