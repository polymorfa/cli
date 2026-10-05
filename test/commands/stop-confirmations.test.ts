import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const teamId = '019d0000-0000-7000-8000-000000000002'
const settings = {
  teamId,
  enabled: false,
  locale: null,
  revision: 0,
  textRevision: 1,
  acknowledgement: null,
  updatedAt: null,
}
let server: TestHttpServer | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
})
function run(command: string) {
  return withEnvironment(
    {
      POLYMORFA_API_KEY: `pmfa_${'A'.repeat(72)}`,
      POLYMORFA_BASE_URL: server!.baseUrl,
      POLYMORFA_CLIENT_TOKEN: undefined,
    },
    () => runCommand(command),
  )
}
describe('STOP confirmation commands', () => {
  test('reads the exact team and revision with no implicit enable', async () => {
    server = await startHttpServer({body: {data: settings}})
    const result = await run('optout confirmations view')
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(`Team\t${teamId}`)
    expect(result.stdout).toContain('Enabled\tfalse')
    expect(
      server.requests.map((request) => [request.method, request.url]),
    ).toEqual([['GET', '/platform/optouts/confirmation-settings']])
  })
  test('returns a machine-readable summary without labelling acceptance as delivery', async () => {
    const summary = {
      enabled: false,
      counts: {queued: 0, admitted: 1, completed: 2, failed: 3, unknown: 4},
    }
    server = await startHttpServer({body: {data: summary}})
    const result = await run('optout confirmations summary --json')
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(summary)
    expect(server.requests[0]?.url).toBe(
      '/platform/optouts/confirmation-summary',
    )
  })
  test('saves the supplied team, revision and explicit locale once', async () => {
    server = await startHttpServer({
      body: {
        data: {
          ...settings,
          enabled: true,
          locale: 'pt-BR',
          revision: 3,
          acknowledgement: 'Confirmed',
        },
      },
    })
    const result = await run(
      `optout confirmations update --team-id ${teamId} --revision 2 --enabled --locale pt-BR`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.method).toBe('PUT')
    expect(server.requests[0]?.url).toBe(
      '/platform/optouts/confirmation-settings',
    )
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      teamId,
      revision: 2,
      enabled: true,
      locale: 'pt-BR',
    })
  })
  test('disables explicitly without a locale', async () => {
    server = await startHttpServer({body: {data: {...settings, revision: 3}}})
    const result = await run(
      `optout confirmations update --team-id ${teamId} --revision 2 --no-enabled`,
    )
    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      teamId,
      revision: 2,
      enabled: false,
      locale: null,
    })
  })
  test.each([
    `--team-id ${teamId} --revision 0 --enabled`,
    `--team-id ${teamId} --revision -1 --no-enabled`,
    `--team-id ${teamId} --revision 2147483647 --no-enabled`,
    `--team-id ${teamId} --revision 0 --enabled --locale fr`,
    `--team-id bad --revision 0 --no-enabled`,
    `--team-id ${teamId} --revision 0`,
  ])(
    'rejects malformed or incomplete preference %s before HTTP',
    async (args) => {
      server = await startHttpServer({body: {data: settings}})
      const result = await run(`optout confirmations update ${args} --json`)
      expect(result.error).toBeDefined()
      expect((result.error as {oclif?: {exit?: number}}).oclif?.exit).toBe(2)
      expect(JSON.parse(result.stderr)).toMatchObject({
        error: {category: 'validation'},
      })
      expect(server.requests).toHaveLength(0)
    },
  )
  test('reports an unexpected save response as validation and points to view', async () => {
    server = await startHttpServer({body: {data: {teamId, enabled: 'yes'}}})
    const result = await run(
      `optout confirmations update --team-id ${teamId} --revision 2 --no-enabled --json`,
    )
    expect((result.error as {oclif?: {exit?: number}}).oclif?.exit).toBe(2)
    const body = JSON.parse(result.stderr) as {
      error: {category: string; message: string}
    }
    expect(body.error.category).toBe('validation')
    expect(body.error.message).toContain('optout confirmations view')
    expect(server.requests).toHaveLength(1)
  })
  test.each([403, 409, 503])(
    'reports %i without retrying or claiming success',
    async (status) => {
      server = await startHttpServer({
        status,
        body: {
          error: {
            code: status === 409 ? 'state_conflict' : 'feature_unavailable',
            message: 'Unavailable',
          },
        },
      })
      const result = await run(
        `optout confirmations update --team-id ${teamId} --revision 0 --no-enabled`,
      )
      expect(result.error).toBeDefined()
      expect(server.requests).toHaveLength(1)
      expect(result.stdout).not.toContain('Enabled\t')
    },
  )
  test('rejects malformed settings responses rather than showing a saved preference', async () => {
    server = await startHttpServer({body: {data: {enabled: true}}})
    const result = await run('optout confirmations view')
    expect(result.error).toBeDefined()
    expect(result.stdout).not.toContain('Enabled\ttrue')
  })
})
