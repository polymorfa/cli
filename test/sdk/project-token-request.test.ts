import {
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaServerError,
} from '@polymorfa/sdk'
import {describe, expect, test, vi} from 'vitest'

import type {TeamSettingEnvironment} from '../../src/context/environment.js'
import {projectTokenRequest} from '../../src/sdk/project-token-request.js'

const TOKEN = 'pmfa_pt_example'
const environment = (baseUrl: string): TeamSettingEnvironment => ({
  apiVersion: '2026-09-01',
  baseUrl,
  credential: TOKEN,
  principalType: 'project_token',
})
const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    headers: {'content-type': 'application/json', ...headers},
    status,
  })

describe('projectTokenRequest', () => {
  test('sends the token, version and body and returns data with metadata', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        json(
          200,
          {data: {policy: 'short'}, success: true},
          {'x-request-id': 'req_1'},
        ),
      ),
    )
    const result = await projectTokenRequest(
      environment('https://api.example.com'),
      {
        body: {policy: 'short'},
        method: 'PUT',
        path: '/platform/call-retention',
      },
      fetch as unknown as typeof globalThis.fetch,
    )
    expect(result.data).toEqual({data: {policy: 'short'}, success: true})
    expect(result.metadata).toMatchObject({
      attempts: 1,
      requestId: 'req_1',
      status: 200,
    })
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://api.example.com/platform/call-retention')
    expect(init).toMatchObject({
      body: JSON.stringify({policy: 'short'}),
      method: 'PUT',
      redirect: 'error',
    })
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      'polymorfa-version': '2026-09-01',
    })
  })

  test('maps API failures to the SDK error classes', async () => {
    const call = (response: Response) =>
      projectTokenRequest(
        environment('https://api.example.com'),
        {method: 'GET', path: '/platform/call-retention'},
        () => Promise.resolve(response),
      )
    await expect(
      call(
        json(403, {error: {code: 'forbidden', message: 'use a team API key'}}),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      constructor: PolymorfaAuthorizationError,
      message: 'use a team API key',
    })
    await expect(
      call(json(409, {error: {code: 'state_conflict', message: 'changed'}})),
    ).rejects.toBeInstanceOf(PolymorfaConflictError)
    await expect(
      call(
        new Response('<html>bad gateway</html>', {
          headers: {'content-type': 'text/html'},
          status: 200,
        }),
      ),
    ).rejects.toBeInstanceOf(PolymorfaServerError)
  })

  test('refuses plain http except on loopback before sending the token', async () => {
    const fetch = vi.fn()
    await expect(
      projectTokenRequest(
        environment('http://api.example.com'),
        {method: 'GET', path: '/platform/call-retention'},
        fetch as unknown as typeof globalThis.fetch,
      ),
    ).rejects.toBeInstanceOf(PolymorfaConfigurationError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
