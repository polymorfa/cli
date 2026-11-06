import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import WebhookCreate from '../../src/commands/webhook/create.js'
import WebhookDelete from '../../src/commands/webhook/delete.js'
import WebhookDeliveryAttemptList from '../../src/commands/webhook/delivery/attempt/list.js'
import WebhookDeliveryAttemptView from '../../src/commands/webhook/delivery/attempt/view.js'
import WebhookDeliveryList from '../../src/commands/webhook/delivery/list.js'
import WebhookDeliveryRetry from '../../src/commands/webhook/delivery/retry.js'
import WebhookDeliveryView from '../../src/commands/webhook/delivery/view.js'
import WebhookList from '../../src/commands/webhook/list.js'
import WebhookSecretRotate from '../../src/commands/webhook/secret/rotate.js'
import WebhookTest from '../../src/commands/webhook/test.js'
import WebhookUpdate from '../../src/commands/webhook/update.js'
import WebhookView from '../../src/commands/webhook/view.js'
import {withEnvironment} from '../helpers/http-server.js'
import {API_KEY_FIXTURE} from '../helpers/opaque-credential.js'

const state = vi.hoisted(() => ({
  calls: [] as Array<{args: unknown[]; method: string}>,
  createSecretAvailable: true,
  listPages: [] as Array<Record<string, unknown>>,
  rotationSecretAvailable: true,
  savedEventTypes: ['message.received'] as string[],
}))

vi.mock('@polymorfa/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  class Client {
    events = resource('events')
    webhookDeliveries = resource('webhookDeliveries')
    webhooks = resource('webhooks')
    constructor(options: unknown) {
      state.calls.push({args: [options], method: 'constructor'})
    }

    project(projectId: string) {
      state.calls.push({args: [projectId], method: 'project'})
      return this
    }
  }
  return {...actual, Client}
})

describe('developer webhook commands', () => {
  const directories: string[] = []

  beforeEach(() => {
    state.calls.splice(0)
    state.createSecretAvailable = true
    state.listPages.splice(0)
    state.rotationSecretAvailable = true
    state.savedEventTypes = ['message.received']
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(
      directories
        .splice(0)
        .map((path) => rm(path, {force: true, recursive: true})),
    )
  })

  test('creates a project webhook and diverts its one-time secret to a private file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const input = join(directory, 'webhook.json')
    const secret = join(directory, 'webhook.secret')
    await writeFile(
      input,
      JSON.stringify({
        eventTypes: ['message.*'],
        url: 'https://example.test/hook',
      }),
    )

    const output = stdout()
    await developerEnvironment(() =>
      WebhookCreate.run([
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--input',
        input,
        '--secret-out',
        secret,
        '--idempotency-key',
        'create_1',
        '--json',
      ]),
    )

    const value = json(output)
    expect(JSON.stringify(value)).not.toContain('pmfa_whsec_test')
    expect(value).toMatchObject({
      idempotency: {key: 'create_1', receiptId: 'receipt_1'},
      operation: null,
      resource: {id: 'wh_1', type: 'webhook'},
      result: {secretDelivery: {mode: 'file', path: secret, written: true}},
      schemaVersion: 1,
    })
    await expect(readFile(secret, 'utf8')).resolves.toBe('pmfa_whsec_test\n')
    expect(findCall('webhooks.create').args[1]).toMatchObject({
      idempotencyKey: 'create_1',
    })
  })

  test('preserves a replayed create receipt when no one-time secret is returned', async () => {
    state.createSecretAvailable = false
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const input = join(directory, 'webhook.json')
    const secret = join(directory, 'webhook.secret')
    await writeFile(input, JSON.stringify({url: 'https://example.test/hook'}))
    const output = stdout()

    await developerEnvironment(() =>
      WebhookCreate.run([
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--input',
        input,
        '--secret-out',
        secret,
        '--json',
      ]),
    )

    expect(json(output)).toMatchObject({
      result: {secretDelivery: {mode: 'file', path: secret, written: false}},
    })
    await expect(readFile(secret, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('lists webhooks with a stable owner and page envelope', async () => {
    state.listPages.push(page([{id: 'wh_1'}], 'next_1', true))
    const output = stdout()

    await developerEnvironment(() =>
      WebhookList.run(['--owner', 'organization', '--limit', '10', '--json']),
    )

    expect(findCall('webhooks.list').args).toEqual([{limit: 10}, {}])
    expect(json(output)).toMatchObject({
      context: {owner: 'organization'},
      data: [{id: 'wh_1'}],
      page: {hasMore: true, nextCursor: 'next_1'},
      schemaVersion: 1,
    })
  })

  test('views one webhook through the typed SDK resource', async () => {
    const output = stdout()

    await developerEnvironment(() =>
      WebhookView.run(['wh_1', '--owner', 'organization', '--json']),
    )

    expect(findCall('webhooks.retrieve').args).toEqual(['wh_1', {}])
    expect(json(output)).toMatchObject({data: {id: 'wh_1'}, schemaVersion: 1})
  })

  test('prints webhook and delivery details in human output', async () => {
    const output = stdout()

    await developerEnvironment(async () => {
      await WebhookView.run(['wh_1', '--owner', 'organization'])
      await WebhookDeliveryView.run(['delivery_1', '--owner', 'organization'])
    })

    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('')
    expect(text).toContain('URL\thttps://hooks.example.test/polymorfa')
    expect(text).toContain('Event types\tmessage.received')
    expect(text).toContain('Phone offline warning\toff')
    expect(text).toContain('Status\tsucceeded')
    expect(text).toContain('Last status code\t204')
  })

  test('deletes only after confirmation and preserves the receipt', async () => {
    const output = stdout()

    await developerEnvironment(() =>
      WebhookDelete.run([
        'wh_1',
        '--owner',
        'organization',
        '--yes',
        '--idempotency-key',
        'delete_1',
        '--json',
      ]),
    )

    expect(findCall('webhooks.delete').args).toEqual([
      'wh_1',
      {idempotencyKey: 'delete_1'},
    ])
    expect(json(output)).toMatchObject({
      idempotency: {key: 'delete_1'},
      operation: null,
      resource: {id: 'wh_1', type: 'webhook'},
    })
  })

  test('shrinks the final delivery page to the remaining item budget', async () => {
    state.listPages.push(
      page([{id: 'd1'}, {id: 'd2'}], 'next_1', true),
      page([{id: 'd3'}], 'next_2', true),
    )
    const output = stdout()
    await developerEnvironment(() =>
      WebhookDeliveryList.run([
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--limit',
        '2',
        '--paginate',
        '--max-items',
        '3',
        '--status',
        'failed',
        '--json',
      ]),
    )

    expect(json(output)).toMatchObject({
      data: [{id: 'd1'}, {id: 'd2'}, {id: 'd3'}],
      page: {hasMore: true, nextCursor: 'next_2'},
      schemaVersion: 1,
    })
    expect(
      state.calls
        .filter(({method}) => method === 'webhookDeliveries.list')
        .map(({args}) => args[0]),
    ).toEqual([
      {limit: 2, status: 'failed'},
      {cursor: 'next_1', limit: 1, status: 'failed'},
    ])
  })

  test('refuses retry before constructing a client when confirmation is unavailable', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await developerEnvironment(() =>
      WebhookDeliveryRetry.run([
        'delivery_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(state.calls).toHaveLength(0)
  })

  test('retrieves one delivery attempt through the first-class SDK method', async () => {
    const output = stdout()
    await developerEnvironment(() =>
      WebhookDeliveryAttemptView.run([
        'delivery_1',
        'attempt_1',
        '--owner',
        'organization',
        '--json',
      ]),
    )

    expect(json(output)).toMatchObject({
      data: {id: 'attempt_1'},
      schemaVersion: 1,
    })
    expect(findCall('webhookDeliveries.retrieveAttempt').args).toEqual([
      'delivery_1',
      'attempt_1',
      {},
    ])
  })

  test('views a delivery through the typed SDK resource', async () => {
    const output = stdout()

    await developerEnvironment(() =>
      WebhookDeliveryView.run([
        'delivery_1',
        '--owner',
        'organization',
        '--json',
      ]),
    )

    expect(findCall('webhookDeliveries.retrieve').args).toEqual([
      'delivery_1',
      {},
    ])
    expect(json(output)).toMatchObject({
      data: {id: 'delivery_1'},
      schemaVersion: 1,
    })
  })

  test('lists immutable attempts in ascending API order', async () => {
    state.listPages.push(page([{id: 'attempt_1', number: 1}], undefined, false))
    const output = stdout()

    await developerEnvironment(() =>
      WebhookDeliveryAttemptList.run([
        'delivery_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--json',
      ]),
    )

    expect(findCall('webhookDeliveries.listAttempts').args).toEqual([
      'delivery_1',
      {limit: 25},
      {},
    ])
    expect(json(output)).toMatchObject({
      data: [{id: 'attempt_1', number: 1}],
      page: {hasMore: false, nextCursor: null},
      schemaVersion: 1,
    })
  })

  test('updates without rotating and keeps the complete idempotency receipt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const input = join(directory, 'webhook.json')
    await writeFile(input, JSON.stringify({enabled: false}))
    const output = stdout()

    await developerEnvironment(() =>
      WebhookUpdate.run([
        'wh_1',
        '--owner',
        'organization',
        '--input',
        input,
        '--idempotency-key',
        'update_1',
        '--json',
      ]),
    )

    expect(findCall('webhooks.update').args).toEqual([
      'wh_1',
      {enabled: false},
      {idempotencyKey: 'update_1'},
    ])
    expect(json(output)).toMatchObject({
      operation: null,
      resource: {id: 'wh_1', type: 'webhook'},
      result: {webhook: {id: 'wh_1'}},
    })
  })

  test('sets the phone offline start day on create', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const input = join(directory, 'webhook.json')
    await writeFile(
      input,
      JSON.stringify({
        eventTypes: ['session.phone_offline'],
        url: 'https://example.test/hook',
      }),
    )
    stdout()
    await developerEnvironment(() =>
      WebhookCreate.run([
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--input',
        input,
        '--phone-offline-start-day',
        '8',
        '--secret-out',
        join(directory, 'webhook.secret'),
        '--idempotency-key',
        'create_1',
        '--json',
      ]),
    )
    expect(findCall('webhooks.create').args[0]).toEqual({
      eventTypes: ['session.phone_offline'],
      phoneOfflineStartDay: 8,
      url: 'https://example.test/hook',
    })
  })

  test('updates only the start day without an input file', async () => {
    stdout()
    await developerEnvironment(() =>
      WebhookUpdate.run([
        'wh_1',
        '--owner',
        'organization',
        '--phone-offline-start-day',
        '13',
        '--idempotency-key',
        'update_1',
        '--json',
      ]),
    )
    expect(findCall('webhooks.update').args.slice(0, 2)).toEqual([
      'wh_1',
      {phoneOfflineStartDay: 13},
    ])
  })

  test('turns warnings off by removing the event from the saved event types', async () => {
    state.savedEventTypes = ['message.received', 'session.phone_offline']
    stdout()
    await developerEnvironment(() =>
      WebhookUpdate.run([
        'wh_1',
        '--owner',
        'organization',
        '--phone-offline-start-day',
        'off',
        '--idempotency-key',
        'update_1',
        '--json',
      ]),
    )
    expect(findCall('webhooks.retrieve').args[0]).toBe('wh_1')
    expect(findCall('webhooks.update').args.slice(0, 2)).toEqual([
      'wh_1',
      {eventTypes: ['message.received']},
    ])
  })

  test('refuses off when it would leave no events', async () => {
    state.savedEventTypes = ['session.phone_offline']
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const error = await developerEnvironment(() =>
      WebhookUpdate.run([
        'wh_1',
        '--owner',
        'organization',
        '--phone-offline-start-day',
        'off',
      ]),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(2)
    expect(String(stderr.mock.calls.flat().join(''))).toContain(
      'at least one event',
    )
    expect(state.calls.some(({method}) => method === 'webhooks.update')).toBe(
      false,
    )
  })

  test.each(['6', '14', '9.5', 'never'])(
    'rejects --phone-offline-start-day %s before calling the SDK',
    async (value) => {
      const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      const error = await developerEnvironment(() =>
        WebhookUpdate.run([
          'wh_1',
          '--owner',
          'organization',
          '--phone-offline-start-day',
          value,
        ]),
      ).catch((caught: unknown) => caught)
      expect(exitCode(error)).not.toBe(0)
      expect(String(stderr.mock.calls.flat().join(''))).toContain(
        'Expected a day from 7 to 13, or off.',
      )
      expect(
        state.calls.some(({method}) => method.startsWith('webhooks.')),
      ).toBe(false)
    },
  )

  test('updates native batching settings without input and can disable after withdrawal', async () => {
    stdout()
    await developerEnvironment(() =>
      WebhookUpdate.run([
        'wh_1',
        '--owner',
        'organization',
        '--batching',
        'on',
        '--batch-max-events',
        '2',
        '--batch-window-ms',
        '100',
        '--json',
      ]),
    )
    expect(findCall('webhooks.update').args[1]).toEqual({
      batching: {enabled: true, maxEvents: 2, windowMs: 100},
    })
    state.calls.splice(0)
    await developerEnvironment(() =>
      WebhookUpdate.run([
        'wh_1',
        '--owner',
        'organization',
        '--batching',
        'off',
        '--json',
      ]),
    )
    expect(findCall('webhooks.update').args[1]).toEqual({
      batching: {enabled: false},
    })
  })

  test('requires an input or a start day for updates', async () => {
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const error = await developerEnvironment(() =>
      WebhookUpdate.run(['wh_1', '--owner', 'organization']),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(2)
    expect(String(stderr.mock.calls.flat().join(''))).toContain(
      'Provide --input, --phone-offline-start-day or --batching.',
    )
    expect(state.calls).toHaveLength(0)
  })

  test('creates a test event and delivery without an extra confirmation', async () => {
    const output = stdout()

    await developerEnvironment(() =>
      WebhookTest.run([
        'wh_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--event',
        'polymorfa.test',
        '--idempotency-key',
        'test_1',
        '--json',
      ]),
    )

    expect(findCall('webhooks.test').args).toEqual([
      'wh_1',
      {eventType: 'polymorfa.test'},
      {idempotencyKey: 'test_1'},
    ])
    expect(json(output)).toMatchObject({
      operation: {id: 'operation_1'},
      resource: {id: 'delivery_1', type: 'webhook_delivery'},
    })
  })

  test('rejects a supplied team webhook body before calling the SDK', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const input = join(directory, 'test.json')
    await writeFile(
      input,
      JSON.stringify({
        body: {
          encoding: 'base64',
          contentType: 'application/json',
          data: 'e30=',
        },
        sessionId: 'session_1',
      }),
    )
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await developerEnvironment(() =>
      WebhookTest.run([
        'wh_1',
        '--owner',
        'organization',
        '--event',
        'customer.created',
        '--input',
        input,
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(state.calls.some(({method}) => method === 'webhooks.test')).toBe(
      false,
    )
  })

  test('requires a project session ID with a supplied test body', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const input = join(directory, 'test.json')
    const body = {
      encoding: 'base64',
      contentType: 'application/json',
      data: 'e30=',
    }
    await writeFile(input, JSON.stringify({body}))
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const error = await developerEnvironment(() =>
      WebhookTest.run([
        'wh_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--event',
        'message.received',
        '--input',
        input,
        '--json',
      ]),
    ).catch((caught: unknown) => caught)

    expect(exitCode(error)).toBe(2)
    expect(state.calls.some(({method}) => method === 'webhooks.test')).toBe(
      false,
    )

    await writeFile(input, JSON.stringify({body, sessionId: 'session_1'}))
    stdout()
    await developerEnvironment(() =>
      WebhookTest.run([
        'wh_1',
        '--owner',
        'project',
        '--project',
        '11111111-1111-4111-8111-111111111111',
        '--event',
        'message.received',
        '--input',
        input,
        '--json',
      ]),
    )
    expect(findCall('webhooks.test').args[1]).toEqual({
      body,
      eventType: 'message.received',
      sessionId: 'session_1',
    })
  })

  test('rotates with confirmation, a bounded overlap, and no secret in JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const secret = join(directory, 'rotated.secret')
    const output = stdout()

    await developerEnvironment(() =>
      WebhookSecretRotate.run([
        'wh_1',
        '--owner',
        'organization',
        '--overlap',
        '1h',
        '--secret-out',
        secret,
        '--yes',
        '--idempotency-key',
        'rotate_1',
        '--json',
      ]),
    )

    expect(findCall('webhooks.rotateSecret').args).toEqual([
      'wh_1',
      {overlapSeconds: 3600},
      {idempotencyKey: 'rotate_1'},
    ])
    expect(JSON.stringify(json(output))).not.toContain('pmfa_whsec_rotated')
    await expect(readFile(secret, 'utf8')).resolves.toBe('pmfa_whsec_rotated\n')
  })

  test('preserves a replayed rotation receipt when no one-time secret is returned', async () => {
    state.rotationSecretAvailable = false
    const directory = await mkdtemp(join(tmpdir(), 'polymorfa-command-'))
    directories.push(directory)
    const secret = join(directory, 'rotated.secret')
    const output = stdout()

    await developerEnvironment(() =>
      WebhookSecretRotate.run([
        'wh_1',
        '--owner',
        'organization',
        '--secret-out',
        secret,
        '--yes',
        '--json',
      ]),
    )

    expect(json(output)).toMatchObject({
      result: {secretDelivery: {mode: 'file', path: secret, written: false}},
    })
    await expect(readFile(secret, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('retries a delivery only after confirmation and returns the new attempt', async () => {
    const output = stdout()

    await developerEnvironment(() =>
      WebhookDeliveryRetry.run([
        'delivery_1',
        '--owner',
        'organization',
        '--yes',
        '--idempotency-key',
        'retry_1',
        '--json',
      ]),
    )

    expect(findCall('webhookDeliveries.retry').args).toEqual([
      'delivery_1',
      {},
      {idempotencyKey: 'retry_1'},
    ])
    expect(json(output)).toMatchObject({
      operation: {id: 'operation_1'},
      resource: {id: 'delivery_1', type: 'webhook_delivery'},
      result: {attemptId: 'attempt_2'},
    })
  })
})

function resource(
  name: string,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return new Proxy(
    {},
    {
      get(_target, property: string) {
        return (...args: unknown[]) => {
          const method = `${name}.${property}`
          state.calls.push({args, method})
          if (property === 'list' || property === 'listAttempts') {
            return Promise.resolve(
              state.listPages.shift() ?? page([], undefined, false),
            )
          }
          if (method === 'webhooks.create') {
            return Promise.resolve(
              response({
                idempotency: receipt('create_1'),
                operationId: null,
                ...(state.createSecretAvailable
                  ? {secret: 'pmfa_whsec_test', secretAvailable: true}
                  : {secretAvailable: false}),
                webhook: {id: 'wh_1'},
              }),
            )
          }
          if (method === 'webhooks.update') {
            return Promise.resolve(
              response({
                idempotency: receipt('update_1'),
                operationId: null,
                webhook: {id: String(args[0])},
              }),
            )
          }
          if (method === 'webhooks.delete') {
            return Promise.resolve(
              response({
                deleted: true,
                idempotency: receipt('delete_1'),
                operationId: null,
                webhookId: String(args[0]),
              }),
            )
          }
          if (method === 'webhooks.test') {
            return Promise.resolve(
              response({
                deliveryId: 'delivery_1',
                eventId: 'event_1',
                idempotency: receipt('test_1'),
                operationId: 'operation_1',
              }),
            )
          }
          if (method === 'webhooks.rotateSecret') {
            return Promise.resolve(
              response({
                idempotency: receipt('rotate_1'),
                operationId: null,
                ...(state.rotationSecretAvailable
                  ? {secret: 'pmfa_whsec_rotated', secretAvailable: true}
                  : {secretAvailable: false}),
                secretMetadata: {
                  createdAt: '2026-09-08T00:00:00Z',
                  previousValidUntil: '2026-09-08T01:00:00Z',
                  version: 2,
                },
                webhookId: String(args[0]),
              }),
            )
          }
          if (method === 'webhookDeliveries.retry') {
            return Promise.resolve(
              response({
                attemptId: 'attempt_2',
                deliveryId: String(args[0]),
                idempotency: receipt('retry_1'),
                operationId: 'operation_1',
              }),
            )
          }
          if (method === 'webhooks.retrieve') {
            return Promise.resolve(
              response({
                createdAt: '2026-09-08T00:00:00Z',
                enabled: true,
                eventTypes: state.savedEventTypes,
                format: 'native',
                headers: [],
                id: String(args[0]),
                owner: 'organization',
                projectId: null,
                updatedAt: '2026-09-08T00:00:00Z',
                url: 'https://hooks.example.test/polymorfa',
              }),
            )
          }
          if (method === 'webhookDeliveries.retrieve') {
            return Promise.resolve(
              response({
                attemptCount: 1,
                capabilities: {retryable: false},
                completedAt: '2026-09-08T00:00:01Z',
                createdAt: '2026-09-08T00:00:00Z',
                eventId: 'event_1',
                id: String(args[0]),
                lastAttemptAt: '2026-09-08T00:00:00Z',
                lastOutcome: {errorCode: null, statusCode: 204},
                nextAttemptAt: null,
                status: 'succeeded',
                webhookId: 'wh_1',
              }),
            )
          }
          if (method === 'webhookDeliveries.retrieveAttempt') {
            return Promise.resolve(
              response({deliveryId: args[0], id: args[1], response: null}),
            )
          }
          const first = args[0]
          const id =
            typeof first === 'string' || typeof first === 'number'
              ? String(first)
              : 'resource_1'
          return Promise.resolve(response({id}))
        }
      },
    },
  )
}

function receipt(key: string) {
  return {id: 'receipt_1', key, replayed: false}
}

function response(data: unknown) {
  return {
    data,
    metadata: {attempts: 1, headers: {}, requestId: 'req_1', status: 200},
  }
}

function page(
  items: unknown[],
  nextCursor: string | undefined,
  hasMore: boolean,
) {
  return {
    hasMore,
    items,
    ...(nextCursor === undefined ? {} : {nextCursor}),
    response: response({}),
  }
}

function findCall(method: string) {
  const call = state.calls.find((candidate) => candidate.method === method)
  if (!call) throw new Error(`Missing ${method} call.`)
  return call
}

function developerEnvironment<T>(run: () => Promise<T>): Promise<T> {
  return withEnvironment(
    {
      POLYMORFA_API_KEY: API_KEY_FIXTURE,
      POLYMORFA_BASE_URL: 'https://api.example.test',
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_PROJECT_TOKEN: undefined,
    },
    run,
  )
}

function stdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

function json(
  output: ReturnType<typeof stdout>,
): Readonly<Record<string, unknown>> {
  return JSON.parse(String(output.mock.calls[0]?.[0])) as Readonly<
    Record<string, unknown>
  >
}

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error))
    return undefined
  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
