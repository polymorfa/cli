import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpSequenceServer,
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Customer commands', () => {
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  test('checks and enables Customers for the selected project', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {
            defaultCustomer: null,
            enabled: false,
            enabledAt: null,
            enabledBy: null,
          },
        },
      },
      {
        body: {
          data: {
            defaultCustomer: customer(),
            enabled: true,
            enabledAt: 1_725_000_000_000,
            enabledBy: 'user_1',
            migratedNumberCount: 2,
          },
        },
      },
    ])

    const status = await environment(() =>
      runCommand('customer status --project project/1 --json'),
    )
    const enable = await environment(() =>
      runCommand(
        'customer enable --project project/1 --idempotency-key enable_1 --json',
      ),
    )

    expect(status.error).toBeUndefined()
    expect(enable.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'GET /v1/projects/project%2F1/customers/status',
      'POST /v1/projects/project%2F1/customers/enable',
    ])
    expect(server.requests[1]?.headers['idempotency-key']).toBe('enable_1')
  })

  test('lists Customers with exact filters and cursor metadata', async () => {
    server = await startHttpServer({
      body: {
        data: [customerSummary()],
        page: {hasMore: true, nextCursor: 'cursor_2'},
      },
    })

    const result = await environment(() =>
      runCommand(
        'customer list --project project/1 --cursor cursor/1 --limit 20 --search Ada --status active --default false --has-numbers true --needs-attention false --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/v1/customers?projectId=project%2F1&cursor=cursor%2F1&limit=20&search=Ada&status=active&isDefault=false&hasNumbers=true&needsAttention=false',
    )
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {
        data: [customerSummary()],
        page: {hasMore: true, nextCursor: 'cursor_2'},
      },
    })
  })

  test('creates, views, and updates a Customer profile', async () => {
    server = await startHttpSequenceServer([
      {body: {data: customer()}},
      {body: {data: customer()}},
      {body: {data: {...customer(), name: null}}},
    ])

    const created = await environment(() =>
      runCommand(
        'customer create --project project/1 --name Ada --phone +15551234567 --external-id crm/1 --idempotency-key create_1 --json',
      ),
    )
    const viewed = await environment(() =>
      runCommand('customer view customer/1 --project project/1 --json'),
    )
    const updated = await environment(() =>
      runCommand(
        'customer update customer/1 --project project/1 --clear-name --phone +15557654321 --json',
      ),
    )

    expect(created.error).toBeUndefined()
    expect(viewed.error).toBeUndefined()
    expect(updated.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /v1/customers',
      'GET /v1/customers/customer%2F1?projectId=project%2F1',
      'PATCH /v1/customers/customer%2F1',
    ])
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      externalCustomerId: 'crm/1',
      name: 'Ada',
      phone: '+15551234567',
      projectId: 'project/1',
    })
    expect(JSON.parse(server.requests[2]?.body ?? '')).toEqual({
      name: null,
      phone: '+15557654321',
      projectId: 'project/1',
    })
  })

  test('archives and restores a Customer with retry identity', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {...customer(), status: 'archived'}}},
      {body: {data: customer()}},
    ])

    const archived = await environment(() =>
      runCommand(
        'customer archive customer/1 --project project/1 --yes --idempotency-key archive_1 --json',
      ),
    )
    const restored = await environment(() =>
      runCommand(
        'customer restore customer/1 --project project/1 --idempotency-key restore_1 --json',
      ),
    )

    expect(archived.error).toBeUndefined()
    expect(restored.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /v1/customers/customer%2F1/archive',
      'POST /v1/customers/customer%2F1/restore',
    ])
    expect(
      server.requests.map(({headers}) => headers['idempotency-key']),
    ).toEqual(['archive_1', 'restore_1'])
  })

  test('lists Customer Numbers, events, and pairing links', async () => {
    server = await startHttpSequenceServer([
      {body: {data: [number()]}},
      {body: {data: [event()]}},
      {body: {data: [pairingLink()]}},
    ])

    const numbers = await environment(() =>
      runCommand('customer number list customer/1 --project project/1 --json'),
    )
    const events = await environment(() =>
      runCommand(
        'customer event list customer/1 --project project/1 --limit 25 --json',
      ),
    )
    const links = await environment(() =>
      runCommand(
        'customer pairing-link list customer/1 --project project/1 --json',
      ),
    )

    expect(numbers.error).toBeUndefined()
    expect(events.error).toBeUndefined()
    expect(links.error).toBeUndefined()
    expect(server.requests.map(({url}) => url)).toEqual([
      '/v1/customers/customer%2F1/numbers?projectId=project%2F1',
      '/v1/customers/customer%2F1/events?projectId=project%2F1&limit=25',
      '/v1/customers/customer%2F1/pairing-links?projectId=project%2F1',
    ])
  })

  test('creates and revokes a pairing link, then transfers a Number', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {...pairingLink(), url: 'https://pair.example/link'}}},
      {body: {data: {...pairingLink(), status: 'revoked'}}},
      {body: {data: number()}},
    ])

    const created = await environment(() =>
      runCommand(
        'customer pairing-link create customer/1 --project project/1 --expected-phone +15551234567 --method qr --method phone --expires-in 3600 --locale en --theme system --idempotency-key link_1 --json',
      ),
    )
    const revoked = await environment(() =>
      runCommand(
        'customer pairing-link revoke customer/1 link/1 --project project/1 --yes --json',
      ),
    )
    const transferred = await environment(() =>
      runCommand(
        'customer number transfer customer/1 session/1 --from customer/source --project project/1 --yes --idempotency-key transfer_1 --json',
      ),
    )

    expect(created.error).toBeUndefined()
    expect(revoked.error).toBeUndefined()
    expect(transferred.error).toBeUndefined()
    expect(server.requests.map(({method, url}) => `${method} ${url}`)).toEqual([
      'POST /v1/customers/customer%2F1/pairing-links',
      'DELETE /v1/customers/customer%2F1/pairing-links/link%2F1?projectId=project%2F1',
      'POST /v1/customers/customer%2F1/numbers/session%2F1/transfer',
    ])
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      expectedPhone: '+15551234567',
      expiresInSeconds: 3600,
      locale: 'en',
      methods: ['qr', 'phone'],
      projectId: 'project/1',
      theme: 'system',
    })
    expect(JSON.parse(server.requests[2]?.body ?? '')).toEqual({
      confirm: true,
      projectId: 'project/1',
      sourceCustomerId: 'customer/source',
    })
    expect(server.requests[2]?.headers['idempotency-key']).toBe('transfer_1')
  })

  test('rejects missing project context and empty updates before transport', async () => {
    server = await startHttpServer({body: {data: customer()}})

    const noProject = await environment(() =>
      runCommand('customer view customer_1 --json'),
    )
    const emptyUpdate = await environment(() =>
      runCommand('customer update customer_1 --project project_1 --json'),
    )

    expect(exitCode(noProject.error)).toBe(2)
    expect(noProject.stderr).toContain('Provide --project')
    expect(exitCode(emptyUpdate.error)).toBe(2)
    expect(emptyUpdate.stderr).toContain(
      'Provide at least one Customer profile field to update',
    )
    expect(server.requests).toHaveLength(0)
  })

  async function environment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_test-key',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})

function customer() {
  return {
    archivedAt: null,
    createdAt: 1_725_000_000_000,
    externalCustomerId: 'crm/1',
    id: 'customer/1',
    isDefault: false,
    name: 'Ada',
    orgId: 'org_1',
    phone: '+15551234567',
    projectId: 'project/1',
    status: 'active',
    updatedAt: 1_725_000_000_000,
  }
}

function customerSummary() {
  const {phone: _phone, ...value} = customer()
  void _phone
  return {
    ...value,
    activePairingLinkState: 'active',
    connectedNumberCount: 1,
    lastActivityAt: 1_725_000_000_000,
    needsAttention: false,
    numberCount: 1,
    phoneMasked: '+1•••4567',
  }
}

function number() {
  return {
    backend: 'whatsmeow',
    createdAt: 1_725_000_000_000,
    customerId: 'customer/1',
    id: 'number_1',
    name: 'Support',
    phoneMasked: '+1•••4567',
    sessionId: 'session/1',
    status: 'connected',
  }
}

function event() {
  return {
    action: 'customer.updated',
    fromStatus: 'active',
    id: 'event_1',
    metadata: {fields: ['name']},
    occurredAt: 1_725_000_000_000,
    pairingLinkId: null,
    sessionId: null,
    toStatus: 'active',
  }
}

function pairingLink() {
  return {
    attemptCount: 0,
    connectedAt: null,
    connectingAt: null,
    createdAt: 1_725_000_000_000,
    createdBy: 'user_1',
    customerId: 'customer/1',
    expectedPhoneMasked: '+1•••4567',
    expiredAt: null,
    expiresAt: 1_725_003_600_000,
    failedAt: null,
    failedExchangeCount: 0,
    id: 'link/1',
    lastErrorCode: null,
    locale: 'en',
    maxAttempts: 3,
    methods: ['qr', 'phone'],
    openedAt: null,
    orgId: 'org_1',
    pendingSessionId: null,
    phoneMismatchCount: 0,
    projectId: 'project/1',
    reservedAt: null,
    revokedAt: null,
    status: 'active',
    theme: 'system',
    updatedAt: 1_725_000_000_000,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
