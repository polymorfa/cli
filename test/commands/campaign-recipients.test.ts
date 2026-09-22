import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Campaign recipient commands', () => {
  let directory: string | undefined
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('pages recipients and filters them by status', async () => {
    server = await startHttpServer({
      body: {
        data: [recipient()],
        page: {hasMore: true, nextCursor: 'cursor_2'},
        success: true,
      },
      headers: {'request-id': 'req_recipients'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'campaign recipients list campaign_1 --project-slug project_1 --status skipped --limit 50 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/projects/project_1/campaigns/campaign_1/recipients?status=skipped&limit=50',
    )
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {
        data: [recipient()],
        page: {hasMore: true, nextCursor: 'cursor_2'},
      },
      metadata: {requestId: 'req_recipients', status: 200},
    })
  })

  test('offers the next cursor in human output when a page remains', async () => {
    server = await startHttpServer({
      body: {
        data: [recipient()],
        page: {hasMore: true, nextCursor: 'cursor_2'},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'campaign recipients list campaign_1 --project-slug project_1',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('opted_out')
    expect(result.stdout).toContain('--cursor cursor_2')
  })

  test('reads recipients from a spreadsheet and reports rejected rows', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-recipients-'))
    const csv = join(directory, 'contacts.csv')
    await writeFile(
      csv,
      'Phone,First name\n+15551234567,Ada\n+15557654321,Grace\n',
      'utf8',
    )
    server = await startHttpServer({
      body: {
        data: {
          added: 1,
          campaignId: 'campaign_1',
          duplicateCount: 1,
          invalidCount: 1,
          invalidRows: [{reason: 'invalid_phone', row: 4}],
          recipientCount: 11,
        },
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign recipients add campaign_1 --project-slug project_1 --csv ${csv} --phone-column Phone --variable "firstName=First name"`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      recipients: [
        {phone: '+15551234567', variables: {firstName: 'Ada'}},
        {phone: '+15557654321', variables: {firstName: 'Grace'}},
      ],
    })
    expect(result.stdout).toContain('Added\t1')
    expect(result.stdout).toContain('Duplicates skipped\t1')
    expect(result.stdout).toContain('Row 4\tinvalid_phone')
  })

  test('names the missing column instead of sending an empty request', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-recipients-'))
    const csv = join(directory, 'contacts.csv')
    await writeFile(csv, 'Mobile,Name\n+15551234567,Ada\n', 'utf8')
    server = await startHttpServer({body: {data: {}, success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign recipients add campaign_1 --project-slug project_1 --csv ${csv}`,
      ),
    )

    expect(result.error).toBeDefined()
    expect(result.stderr).toContain('has no phone column')
    expect(server.requests).toHaveLength(0)
  })

  test('refuses rows with an empty phone instead of dropping them', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-recipients-'))
    const csv = join(directory, 'contacts.csv')
    await writeFile(
      csv,
      'phone,Name\n,Ada\n+15551234567,Grace\n,,\n\n  ,Linus\n',
      'utf8',
    )
    server = await startHttpServer({body: {data: {}, success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `campaign recipients add campaign_1 --project-slug project_1 --csv ${csv}`,
      ),
    )

    expect(result.error).toBeDefined()
    // Wholly blank rows (4 and 5) are ignored; rows 2 and 6 have a name but
    // no phone and must be reported, not silently omitted.
    expect(result.stderr).toContain('2 rows with an empty phone value')
    expect(result.stderr).toContain('row 2, 6')
    expect(server.requests).toHaveLength(0)
  })

  test('says a campaign was cancelled when stop returns no operation', async () => {
    server = await startHttpServer({
      body: {
        data: {...campaign(), operationId: null, status: 'stopped'},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('campaign stop campaign_1 --project-slug project_1 --yes'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('had no active delivery run')
    expect(result.stdout).not.toContain('operation null')
  })

  test('still reports the operation when stop starts one', async () => {
    server = await startHttpServer({
      body: {
        data: {...campaign(), operationId: 'op_stop', status: 'stopping'},
        success: true,
      },
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('campaign stop campaign_1 --project-slug project_1 --yes'),
    )

    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain(
      'Accepted campaign stop as operation op_stop',
    )
  })

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }
})

function recipient() {
  return {
    attempts: 0,
    deliveredAt: null,
    externalMessageId: null,
    failedAt: null,
    id: 'recipient_1',
    lastError: 'opted_out',
    phone: '+15551234567',
    queuedAt: 1_723_000_000_000,
    readAt: null,
    respondedAt: null,
    sentAt: null,
    status: 'skipped',
    variables: {firstName: 'Ada'},
    variantKey: null,
  }
}

function campaign() {
  return {
    completedAt: null,
    createdAt: 1_723_000_000_000,
    deliveredCount: 8,
    failedCount: 1,
    id: 'campaign_1',
    launchedAt: 1_723_000_100_000,
    name: 'September launch',
    readCount: 6,
    recipientCount: 10,
    recipientListId: 'recipients_1',
    scheduledAt: null,
    sentCount: 9,
    skippedCount: 0,
    status: 'running',
    templateId: 'template_1',
    updatedAt: 1_723_000_200_000,
  }
}
