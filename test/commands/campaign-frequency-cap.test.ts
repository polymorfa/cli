import {runCommand} from '@oclif/test'
import {afterEach, expect, test} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'
import {
  renderFrequencyCapAnalytics,
  frequencyCapInput,
} from '../../src/services/campaign-frequency-cap.js'
import {renderCampaignRecipients} from '../../src/services/campaigns.js'
let server: TestHttpServer | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
})
const settings = {
  teamId: 'team',
  maxPer24Hours: 2,
  maxPer7Days: 5,
  revision: 3,
  updatedAt: 1800000000000,
}
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
test('get shows team windows and revision', async () => {
  server = await startHttpServer({body: {data: settings}})
  const result = await run('campaign settings frequency-cap get')
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain('Revision\t3')
  expect(server.requests[0]).toMatchObject({
    method: 'GET',
    url: '/platform/campaign-settings/frequency-cap',
  })
})
test.each([
  ['set --max-per-24-hours 2 --max-per-7-days 5', 2, 5],
  ['set --max-per-7-days 5', null, 5],
  ['remove', null, null],
] as const)(
  '%s writes the supplied revision and both windows',
  async (command, daily, weekly) => {
    server = await startHttpServer({body: {data: settings}})
    const result = await run(
      `campaign settings frequency-cap ${command} --revision 3 --json`,
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.method).toBe('PUT')
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      maxPer24Hours: daily,
      maxPer7Days: weekly,
      revision: 3,
    })
  },
)
test.each([
  [409, 'conflict'],
  [403, 'feature_unavailable'],
] as const)('surfaces %s without repeating the write', async (status, code) => {
  server = await startHttpServer({
    status,
    body: {error: {code, message: 'Read and reconcile or obtain beta access'}},
  })
  const result = await run(
    'campaign settings frequency-cap set --max-per-24-hours 2 --revision 3 --json',
  )
  expect(result.error).toBeDefined()
  expect(result.stdout + result.stderr).toContain(code)
  expect(server.requests).toHaveLength(1)
})
test('rejects invalid or missing limits before HTTP', async () => {
  server = await startHttpServer({body: {data: settings}})
  for (const flags of [
    '--max-per-24-hours 6 --max-per-7-days 5',
    '--max-per-24-hours 51',
    '',
  ]) {
    expect(
      (await run(`campaign settings frequency-cap set --revision 3 ${flags}`))
        .error,
    ).toBeDefined()
  }
  expect(server.requests).toHaveLength(0)
})
test('campaign update sends a cap and explicit removal without retry', async () => {
  server = await startHttpServer({
    body: {
      success: true,
      data: {id: 'c', frequencyCap: null, scheduledAt: null},
    },
  })
  const changed = await run(
    'campaign update c --project-slug p --frequency-cap-24-hours 2 --json',
  )
  expect(changed.error).toBeUndefined()
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    frequencyCap: {maxPer24Hours: 2, maxPer7Days: null},
  })
  const removed = await run(
    'campaign update c --project-slug p --remove-frequency-cap --json',
  )
  expect(removed.error).toBeUndefined()
  expect(server.requests[1]?.url).toBe('/messaging/projects/p/campaigns/c')
  expect(JSON.parse(server.requests[1]!.body)).toEqual({frequencyCap: null})
})
test('cap flags preserve create fields and refuse conflicting JSON', () => {
  expect(
    frequencyCapInput({name: 'Launch'}, {'frequency-cap-24-hours': 2}),
  ).toEqual({
    name: 'Launch',
    frequencyCap: {maxPer24Hours: 2, maxPer7Days: null},
  })
  expect(() =>
    frequencyCapInput({frequencyCap: null}, {'frequency-cap-24-hours': 2}),
  ).toThrow('Use cap flags')
})
test('recipient reason filter reaches the API and human output shows cap skips', async () => {
  server = await startHttpServer({
    body: {success: true, data: [], page: {hasMore: false, nextCursor: null}},
  })
  const result = await run(
    'campaign recipients list c --project-slug p --status skipped --reason frequency_cap --json',
  )
  expect(result.error).toBeUndefined()
  expect(server.requests[0]?.url).toContain('reason=frequency_cap')
  expect(
    renderCampaignRecipients({
      data: [
        {
          id: 'r',
          phone: '+15550000000',
          status: 'skipped',
          attempts: 0,
          lastError: 'frequency_cap_exceeded',
          failureReason: 'frequency_cap',
          sentAt: null,
        } as unknown as import('@polymorfa/sdk').CampaignRecipient,
      ],
      page: {hasMore: false, nextCursor: null},
    }),
  ).toContain('frequency_cap')
  expect(
    renderFrequencyCapAnalytics({frequencyCap: {skippedRecipientCount: 4}}),
  ).toEqual(['Skipped by frequency cap\t4'])
  expect(renderFrequencyCapAnalytics({})).toEqual([])
})
