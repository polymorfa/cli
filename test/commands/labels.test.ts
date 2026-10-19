import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('label commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('lists unpaged labels for an explicit encoded session', async () => {
    server = await startHttpServer({
      body: {data: [label()], success: true},
      headers: {'request-id': 'req_labels'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('label list --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: [label()],
      metadata: {attempts: 1, requestId: 'req_labels', status: 200},
    })
    expect(server.requests[0]?.url).toBe('/messaging/session%2Fmain/labels')
  })

  test('preserves the observation envelope only when requested', async () => {
    const collection = {
      expiresAt: '2026-08-19T22:00:00.000Z',
      labels: [label()],
      observedAt: '2026-08-19T21:00:00.000Z',
      policy: 'cache',
      status: 'fresh',
    }
    server = await startHttpServer({
      body: {data: collection, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('label list --session session_1 --include-observation --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data: collection})
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/labels?includeObservation=true',
    )
  })

  test('rejects a client token before a Labels request', async () => {
    server = await startHttpServer({body: {data: [], success: true}})

    const result = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_browser',
      },
      () => runCommand('label list --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Label commands require a server API key')
    expect(server.requests).toHaveLength(0)
  })

  test('creates a label with an idempotency key', async () => {
    server = await startHttpServer({
      body: {data: label(), success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'label create --session session_1 --name Priority --color 5 --idempotency-key create_priority --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({data: label()})
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/session_1/labels',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      color: 5,
      name: 'Priority',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      'create_priority',
    )
  })

  test('requires at least one update field before transport', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('label update label_1 --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Provide --name or --color')
    expect(server.requests).toHaveLength(0)
  })

  test('updates a label through an encoded identifier', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'label update label/1 --session session_1 --name Urgent --color 7 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/messaging/session_1/labels/label%2F1',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      color: 7,
      name: 'Urgent',
    })
  })

  test('requires explicit yes before deleting a label', async () => {
    const result = await runCommand(
      'label delete label_1 --session session_1 --json',
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Missing required flag yes')
  })

  test('deletes a label only after explicit confirmation', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'label delete label/1 --session session_1 --yes --idempotency-key delete_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: '',
      method: 'DELETE',
      url: '/messaging/session_1/labels/label%2F1',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('delete_1')
  })

  test('lists labels for one encoded chat', async () => {
    server = await startHttpServer({
      body: {data: [label()], success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('label chat list 120363@g.us --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/labels/chats/120363%40g.us',
    )
  })

  test('replaces the complete chat label set explicitly', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'label chat replace 120363@g.us --session session_1 --label priority --label customer --idempotency-key replace_1 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({labels: ['priority', 'customer']}),
      method: 'PUT',
      url: '/messaging/session_1/labels/chats/120363%40g.us',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('replace_1')
  })

  test('requires an explicit label set or clear action before replacement', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand('label chat replace chat_1 --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Provide --label or --clear')
    expect(server.requests).toHaveLength(0)
  })

  test('detaches every chat label only through the explicit clear action', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'label chat replace chat_1 --session session_1 --clear --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({labels: []})
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})

function label() {
  return {
    chatCount: 2,
    color: 5,
    id: 'label_1',
    name: 'Priority',
    observedAt: '2026-08-19T21:00:00.000Z',
    orderIndex: 0,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
