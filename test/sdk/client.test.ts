import {
  isEvent,
  MessagingClient,
  Client as PlatformClient,
  RawClient,
  type WebhookEvent,
} from '@polymorfa/sdk'
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
      credential: {
        type: 'apiKey',
        value:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
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
    ).toThrow(
      'Client and project tokens cannot be used as organization server API keys.',
    )
  })

  test('creates a typed Messaging client with session pairing and operation polling', () => {
    const client = createMessagingClient({
      surface: 'messaging',
      credential: {
        type: 'apiKey',
        value:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      timeoutMs: 1234,
    })

    expect(client).toBeInstanceOf(MessagingClient)
    expect(client.sessions).toHaveProperty('qr')
    expect(client.sessions).toHaveProperty('requestPairingCode')
    expect(client).not.toHaveProperty('operations')
  })

  test('creates a typed Platform client and rejects the wrong surface', () => {
    const client = createPlatformClient({
      surface: 'platform',
      credential: {
        type: 'apiKey',
        value:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    })

    expect(client).toBeInstanceOf(PlatformClient)
    expect(client.billing).toHaveProperty('retrieve')
    expect(client.billing).toHaveProperty('usage')
    expect(client.billing).toHaveProperty('listTransactions')
    expect(client.billing).toHaveProperty('listPricing')
    expect(client.billing).toHaveProperty('updateReminderSettings')
    expect(client.organizations).not.toHaveProperty('update')

    expect(() =>
      createPlatformClient({
        surface: 'messaging',
        credential: {
          type: 'apiKey',
          value:
            'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      }),
    ).toThrow('requires the Platform API surface')
  })
})

describe('typed webhook events', () => {
  test('narrows a signed event to its concrete root-exported payload', () => {
    const event: WebhookEvent = {
      event: 'command.result',
      id: 'evt_123',
      payload: {
        command: 'session.start',
        requestId: 'req_123',
        success: true,
      },
      session: 'session_123',
      timestamp: '2026-08-19T18:00:00.000Z',
    }

    expect(isEvent(event, 'command.result')).toBe(true)
    if (isEvent(event, 'command.result')) {
      expect(event.payload.command).toBe('session.start')
      expect(event.payload.success).toBe(true)
    }
    expect(isEvent(event, 'message.received')).toBe(false)
  })
})
