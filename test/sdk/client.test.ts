import {MessagingClient, PlatformClient, RawClient} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {
  createMessagingClient,
  createPlatformClient,
  createRawClient,
} from '../../src/sdk/client.js'

describe('createRawClient', () => {
  test('returns the public Platform raw client', () => {
    const client = createRawClient({
      surface: 'platform',
      credential: {type: 'apiKey', value: 'pmfa_test-key'},
    })

    expect(client).toBeInstanceOf(RawClient)
  })

  test('returns the public Messaging raw client', () => {
    const client = createRawClient({
      surface: 'messaging',
      credential: {type: 'clientToken', value: 'pmfa_ct_browser'},
    })

    expect(client).toBeInstanceOf(RawClient)
  })

  test('lets the SDK reject a client token on the Platform surface', () => {
    expect(() =>
      createRawClient({
        surface: 'platform',
        credential: {type: 'clientToken', value: 'pmfa_ct_browser'},
      }),
    ).toThrow('Platform server API key must use the pmfa_ prefix.')
  })

  test('creates a typed Messaging client with session pairing and operation polling', () => {
    const client = createMessagingClient({
      surface: 'messaging',
      credential: {type: 'apiKey', value: 'pmfa_test-key'},
      timeoutMs: 1234,
    })

    expect(client).toBeInstanceOf(MessagingClient)
    expect(client.sessions).toHaveProperty('qr')
    expect(client.sessions).toHaveProperty('requestPairingCode')
    expect(client.operations).toHaveProperty('retrieve')
  })

  test('creates a typed Platform client and rejects the wrong surface', () => {
    expect(
      createPlatformClient({
        surface: 'platform',
        credential: {type: 'apiKey', value: 'pmfa_test-key'},
      }),
    ).toBeInstanceOf(PlatformClient)

    expect(() =>
      createPlatformClient({
        surface: 'messaging',
        credential: {type: 'apiKey', value: 'pmfa_test-key'},
      }),
    ).toThrow('requires the Platform API surface')
  })
})
