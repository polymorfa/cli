import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import EventStream from '../../src/commands/event/stream.js'
import {withEnvironment} from '../helpers/http-server.js'

const PROJECT = '11111111-1111-4111-8111-111111111111'

const sdk = vi.hoisted(() => ({
  params: [] as Array<Record<string, unknown>>,
  items: [] as unknown[],
  gap: undefined as {missedEvents: number} | undefined,
  failure: undefined as Error | undefined,
}))

vi.mock('@polymorfa/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@polymorfa/sdk')>()

  class Client {
    readonly events = {
      stream: (params: Record<string, unknown>) => {
        sdk.params.push(params)
        return {
          async *[Symbol.asyncIterator]() {
            await Promise.resolve()
            if (sdk.gap !== undefined) {
              ;(params.onGap as (gap: unknown) => void)({
                reason: 'retention_exceeded',
                missedEvents: sdk.gap.missedEvents,
                requestedCursor: 'c0',
              })
            }
            for (const item of sdk.items) {
              if ((params.signal as AbortSignal).aborted) return
              yield item
            }
            if (sdk.failure !== undefined) throw sdk.failure
          },
        }
      },
    }

    project(): this {
      return this
    }
  }

  return {...original, Client}
})

describe('event stream', () => {
  beforeEach(() => {
    sdk.params.length = 0
    sdk.items = [item('e1', 'c1'), item('e2', 'c2', false)]
    sdk.gap = undefined
    sdk.failure = undefined
  })

  afterEach(() => vi.restoreAllMocks())

  test('streams JSON lines with filters and a resume cursor', async () => {
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await environment(() =>
      EventStream.run([
        '--owner',
        'project',
        '--project',
        PROJECT,
        '--type',
        'message.*',
        '--type',
        'session.connected',
        '--from',
        'c0',
        '--json',
      ]),
    )
    expect(sdk.params[0]).toMatchObject({
      types: ['message.*', 'session.connected'],
      since: 'c0',
    })
    const lines = output.mock.calls.map(
      (call) => JSON.parse(String(call[0])) as Record<string, unknown>,
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      schemaVersion: 1,
      type: 'event',
      cursor: 'c1',
      event: {id: 'e1', type: 'message.received'},
      webhook: {id: 'e1'},
    })
    expect(lines[1]).toMatchObject({
      schemaVersion: 1,
      type: 'event',
      cursor: 'c2',
      event: {id: 'e2'},
      webhook: null,
    })
    expect(lines[0]?.event).not.toHaveProperty('payload')
  })

  test('prints one human line per event and the resume cursor', async () => {
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const errors = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    await environment(() =>
      EventStream.run(['--owner', 'project', '--project', PROJECT]),
    )
    expect(String(output.mock.calls[0]?.[0])).toBe(
      '2026-09-18T10:00:00.000Z\tmessage.received\te1\t{"text":"hi"}\n',
    )
    expect(String(output.mock.calls[1]?.[0])).toContain(
      '(no body: not_retained)',
    )
    expect(errors.mock.calls.map((call) => String(call[0]))).toContain(
      'Resume with --from c2\n',
    )
  })

  test('stops after --max-events', async () => {
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await environment(() =>
      EventStream.run([
        '--owner',
        'project',
        '--project',
        PROJECT,
        '--max-events',
        '1',
        '--json',
      ]),
    )
    expect(output).toHaveBeenCalledTimes(1)
  })

  test('exits with the stream gap code when --on-gap stop sees expired events', async () => {
    sdk.gap = {missedEvents: 3}
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      EventStream.run([
        '--owner',
        'project',
        '--project',
        PROJECT,
        '--from',
        'c0',
        '--on-gap',
        'stop',
        '--json',
      ]),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(9)
  })

  test('requires a project owner', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      EventStream.run(['--owner', 'organization', '--json']),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(8)
    expect(sdk.params).toHaveLength(0)
  })

  test('maps a disabled beta to the authorization exit code', async () => {
    const {PolymorfaAuthorizationError} = await import('@polymorfa/sdk')
    sdk.items = []
    sdk.failure = new PolymorfaAuthorizationError(
      'Event streams is not enabled for this team.',
      {code: 'feature_unavailable', status: 403},
    )
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const error = await environment(() =>
      EventStream.run(['--owner', 'project', '--project', PROJECT, '--json']),
    ).catch((caught: unknown) => caught)
    expect(exitCode(error)).toBe(3)
  })
})

function item(id: string, cursor: string, withBody = true) {
  return {
    cursor,
    streamId: 's',
    sequence: 2,
    event: {
      id,
      organizationId: 'org_1',
      projectId: PROJECT,
      type: 'message.received',
      source: 'runtime',
      environment: 'development',
      createdAt: '2026-09-18T10:00:00.000Z',
      payloadAvailability: withBody ? 'available' : 'not_retained',
      payload: withBody
        ? {encoding: 'base64', contentType: 'application/json', data: 'e30='}
        : null,
      replayableUntil: null,
      metadataExpiresAt: '2026-10-18T10:00:00.000Z',
    },
    webhook: withBody
      ? {
          id,
          session: 'support',
          timestamp: '2026-09-18T10:00:00.000Z',
          event: 'message.received',
          payload: {text: 'hi'},
        }
      : null,
  }
}

function environment<T>(run: () => Promise<T>): Promise<T> {
  return withEnvironment(
    {
      POLYMORFA_API_KEY:
        'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      POLYMORFA_BASE_URL: 'https://api.example.test',
      POLYMORFA_CLIENT_TOKEN: undefined,
      POLYMORFA_PROJECT_TOKEN: undefined,
    },
    run,
  )
}

function exitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('oclif' in error)) {
    return undefined
  }
  return (error as {oclif?: {exit?: number}}).oclif?.exit
}
