import {afterEach, describe, expect, test} from 'vitest'

import {createMessagingClient} from '../../src/sdk/client.js'
import {
  getGroupInviteLink,
  getGroupCapabilities,
  renderGroupCapabilities,
  listGroupParticipants,
  listGroups,
  viewGroup,
} from '../../src/services/groups.js'
import {startHttpServer, type TestHttpServer} from '../helpers/http-server.js'

describe('group read services', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists complete group resources and preserves response metadata', async () => {
    const group = completeGroup()
    server = await startHttpServer({
      body: {data: [group], success: true},
      headers: {'request-id': 'req_groups'},
    })

    const result = await listGroups(client(server.baseUrl), 'session/main')

    expect(result).toEqual({
      data: [group],
      metadata: {attempts: 1, requestId: 'req_groups', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/messaging/session%2Fmain/groups')
  })

  test('retrieves a group and its participants through encoded identifiers', async () => {
    const group = completeGroup()
    server = await startHttpServer({body: {data: group, success: true}})

    await expect(
      viewGroup(client(server.baseUrl), 'session/main', '123@g.us'),
    ).resolves.toMatchObject({data: group})
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/groups/123%40g.us',
    )

    await server.close()
    server = await startHttpServer({
      body: {data: group.participants, success: true},
    })
    await expect(
      listGroupParticipants(client(server.baseUrl), 'session/main', '123@g.us'),
    ).resolves.toMatchObject({data: group.participants})
  })

  test('reads group capabilities without replacing unknown values', async () => {
    const data = {
      status: 'unknown' as const,
      syncedAt: null,
      checkedAt: null,
      capabilities: [
        {
          key: 'polls.endTime',
          kind: 'feature' as const,
          unit: null,
          value: null,
          source: null,
        },
      ],
    }
    server = await startHttpServer({body: {success: true, data}})
    const response = await getGroupCapabilities(
      client(server.baseUrl),
      'session/main',
      '9007199254740993',
    )
    expect(response.data).toEqual(data)
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/groups/9007199254740993/capabilities',
    )
    expect(renderGroupCapabilities(data)).toContain(
      'polls.endTime\tunknown\tunknown',
    )
  })

  test('derives the canonical invite URL while retaining its source code', async () => {
    server = await startHttpServer({
      body: {data: {code: 'Invite_123'}, success: true},
    })

    await expect(
      getGroupInviteLink(client(server.baseUrl), 'session_1', '123@g.us'),
    ).resolves.toMatchObject({
      data: {
        code: 'Invite_123',
        url: 'https://chat.whatsapp.com/Invite_123',
      },
    })
  })
})

function client(baseUrl: string) {
  return createMessagingClient({
    baseUrl,
    credential: {
      type: 'apiKey',
      value:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
    surface: 'messaging',
  })
}

function completeGroup() {
  return {
    createdAt: 1_766_000_000,
    description: 'Release coordination',
    id: '123@g.us',
    name: 'Launch team',
    ownerLid: 'owner@lid',
    participants: [
      {
        id: '15551234567@s.whatsapp.net',
        isAdmin: true,
        isSuperAdmin: false,
        lid: 'member@lid',
        phoneNumber: '15551234567',
      },
    ],
  }
}
