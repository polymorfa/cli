import {afterEach, describe, expect, test} from 'vitest'

import {listMcpSessions} from '../../src/mcp/session-discovery.js'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const API_KEY = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'

describe('MCP session discovery', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('reads one project and returns only non-secret session fields', async () => {
    server = await startHttpServer({
      body: {
        data: [
          {
            projectId: PROJECT_ID,
            sessionId: 'session_1',
            name: 'Support',
            status: 'CONNECTED',
            testMode: false,
            phone: '+49123456789',
            token: 'secret-value',
          },
        ],
      },
      headers: {'request-id': 'req_sessions'},
    })

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_PROJECT_TOKEN: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      () => listMcpSessions(PROJECT_ID),
    )

    expect(result).toEqual({
      sessions: [
        {
          sessionId: 'session_1',
          name: 'Support',
          status: 'CONNECTED',
          testMode: false,
        },
      ],
      status: 200,
      requestId: 'req_sessions',
    })
    expect(JSON.stringify(result)).not.toMatch(
      /phone|secret-value|\+49123456789/,
    )
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      `GET /platform/sessions?projectId=${PROJECT_ID}`,
    ])
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`)
  })

  test('rejects a project token rather than falling back to an active profile', async () => {
    server = await startHttpServer({body: {data: []}})
    await expect(
      withEnvironment(
        {
          POLYMORFA_API_KEY: undefined,
          POLYMORFA_PROJECT_TOKEN: `pmfa_pt_${'A'.repeat(93)}A`,
          POLYMORFA_CLIENT_TOKEN: undefined,
          POLYMORFA_BASE_URL: server.baseUrl,
        },
        () => listMcpSessions(PROJECT_ID),
      ),
    ).rejects.toThrow('Select only one organization API key')
    expect(server.requests).toHaveLength(0)
  })
})
