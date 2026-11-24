import {
  Client,
  isEvent,
  MessagingClient,
  RawClient,
  type WebhookEvent,
} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {
  createMessagingClient,
  createPlatformClient,
  createRawClient,
} from '../../src/sdk/client.js'
import {startHttpServer} from '../helpers/http-server.js'

describe('createRawClient', () => {
  test('returns the public Platform raw client', () => {
    const client = createRawClient({
      surface: 'platform',
      credential: {
        type: 'apiKey',
        value: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      },
    })

    expect(client).toBeInstanceOf(RawClient)
  })

  test('returns the public Messaging raw client', () => {
    const client = createRawClient({
      surface: 'messaging',
      credential: {type: 'clientToken', value: 'pmfa_ct_cG1mYV9jdF9icm93c2Vy'},
    })

    expect(client).toBeInstanceOf(RawClient)
  })

  test('lets the SDK reject a client token on the Platform surface', () => {
    expect(() =>
      createRawClient({
        surface: 'platform',
        credential: {
          type: 'clientToken',
          value: 'pmfa_ct_cG1mYV9jdF9icm93c2Vy',
        },
      }),
    ).toThrow('Client and project tokens cannot be used as team keys.')
  })

  test('creates a typed Messaging client with connection and operation resources', () => {
    const client = createMessagingClient({
      surface: 'messaging',
      credential: {
        type: 'apiKey',
        value: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      },
      timeoutMs: 1234,
    })

    expect(client).toBeInstanceOf(MessagingClient)
    expect(client.connections).toHaveProperty('qr')
    expect(client.connections).toHaveProperty('requestPairingCode')
    expect(client.quickLinks).toHaveProperty('create')
    expect(client.quickLinks).toHaveProperty('retrieve')
    expect(client.quickLinks).toHaveProperty('cancel')
    expect(client).not.toHaveProperty('operations')
  })

  test('creates a server-only Messaging client from a project token', () => {
    const client = createMessagingClient({
      credential: {
        type: 'projectToken',
        value: 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      },
      surface: 'messaging',
    })

    expect(client).toBeInstanceOf(MessagingClient)
    expect(client.quickLinks).toHaveProperty('create')
  })

  test('creates the unified team client and rejects the wrong surface', () => {
    const client = createPlatformClient({
      surface: 'platform',
      credential: {
        type: 'apiKey',
        value: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      },
    })

    expect(client).toBeInstanceOf(Client)
    expect(client.owner).toBe('team')
    expect(client.billing).toHaveProperty('retrieve')
    expect(client.billing).toHaveProperty('usage')
    expect(client.billing).toHaveProperty('listTransactions')
    expect(client.billing).toHaveProperty('listPricing')
    expect(client.billing).not.toHaveProperty('updateReminderSettings')
    expect(client.connections).toHaveProperty('retrieve')
    expect(client.connections).toHaveProperty('update')
    expect(client.connections).toHaveProperty('quoteTierChange')
    expect(client.connections).toHaveProperty('retrieveTierChange')
    expect(client.teams).not.toHaveProperty('update')

    expect(() =>
      createPlatformClient({
        surface: 'messaging',
        credential: {
          type: 'apiKey',
          value: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        },
      }),
    ).toThrow('requires the Platform API surface')
  })

  test('uses the unified project view for typed developer resources', async () => {
    const server = await startHttpServer({
      body: {data: [], page: {nextCursor: null}},
      headers: {'x-request-id': 'req_project_events'},
    })
    try {
      const client = createPlatformClient({
        baseUrl: server.baseUrl,
        credential: {
          type: 'apiKey',
          value: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        },
        surface: 'platform',
      }).project('11111111-1111-4111-8111-111111111111')

      const page = await client.events.list({limit: 25})

      expect(page.items).toEqual([])
      expect(page.response.metadata.requestId).toBe('req_project_events')
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]).toMatchObject({
        method: 'GET',
        url: '/platform/projects/11111111-1111-4111-8111-111111111111/events?limit=25',
      })
      expect(server.requests[0]?.headers.authorization).toBe(
        'Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      )
    } finally {
      await server.close()
    }
  })
})

describe('typed webhook events', () => {
  test('narrows a signed event to its concrete root-exported payload', () => {
    const event: WebhookEvent = {
      event: 'command.result',
      id: 'evt_123',
      payload: {
        command: 'connection.start',
        requestId: 'req_123',
        success: true,
      },
      connection: 'connection_123',
      timestamp: '2026-08-19T18:00:00.000Z',
    }

    expect(isEvent(event, 'command.result')).toBe(true)
    if (isEvent(event, 'command.result')) {
      expect(event.payload.command).toBe('connection.start')
      expect(event.payload.success).toBe(true)
    }
    expect(isEvent(event, 'message.received')).toBe(false)
  })
})
