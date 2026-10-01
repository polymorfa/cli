import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {AsyncEntry} from '@napi-rs/keyring'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('Official API commands', () => {
  let server: TestHttpServer | undefined
  let directory: string | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory) await rm(directory, {recursive: true, force: true})
    directory = undefined
  })

  test('uses the typed catalog and preserves IDs in structured output', async () => {
    const data = [
      {
        id: 'template_1',
        metaTemplateId: '98765432109876543210',
        name: 'order_update',
        language: 'pt_BR',
      },
    ]
    server = await startHttpServer({body: {success: true, data}})
    const result = await credential(() =>
      runCommand('cloud template list --session number/eu --json'),
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(data)
    expect(server.requests[0]?.url).toBe('/messaging/number%2Feu/templates')
  })

  test('encodes a template name and forwards its selected language', async () => {
    server = await startHttpServer({
      body: {success: true, data: {name: 'order/update', language: 'pt_BR'}},
    })
    const result = await credential(() =>
      runCommand(
        'cloud template get order/update --session number/eu --language pt_BR --json',
      ),
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/number%2Feu/templates/order%2Fupdate?language=pt_BR',
    )
  })

  test('submits bounded template JSON once', async () => {
    directory = await mkdtemp(
      join(homedir(), '.polymorfa-agent-work', 'cloud-cli-test-'),
    )
    const path = join(directory, 'template.json')
    const body = {
      name: 'order_update',
      language: 'en_US',
      category: 'UTILITY',
      components: [{type: 'BODY', text: 'Order ready'}],
    }
    await writeFile(path, JSON.stringify(body))
    server = await startHttpServer({
      status: 502,
      body: {
        error: {
          code: 'upstream_failure',
          message: 'Provider outcome is unknown',
        },
      },
    })
    const result = await credential(() =>
      runCommand(
        `cloud template create --session number --input ${path} --idempotency-key tpl-1 --json`,
      ),
    )
    expect(exitCode(result.error)).toBe(5)
    expect(server.requests).toHaveLength(1)
    expect(JSON.parse(server.requests[0]!.body)).toEqual(body)
    expect(server.requests[0]!.headers['idempotency-key']).toBe('tpl-1')
  })

  test('uses the explicit template project when a different directory is linked', async () => {
    directory = await mkdtemp(
      join(homedir(), '.polymorfa-agent-work', 'cloud-cli-test-'),
    )
    await writeFile(
      join(directory, 'polymorfa.json'),
      JSON.stringify({
        project: '11111111-1111-4111-8111-111111111111',
        version: 1,
      }),
    )
    const configDirectory = join(directory, 'config')
    await mkdir(configDirectory)
    await writeFile(
      join(configDirectory, 'config.json'),
      JSON.stringify({
        version: 2,
        activeProfile: 'template',
        profiles: {
          template: {
            credential: {
              kind: 'projectToken',
              account: 'profile:template:projectToken',
            },
            owner: 'project',
            project: '22222222-2222-4222-8222-222222222222',
          },
        },
      }),
    )
    const keyring = vi
      .spyOn(AsyncEntry.prototype, 'getPassword')
      .mockResolvedValue(`pmfa_pt_${'A'.repeat(94)}`)
    server = await startHttpServer({
      status: 202,
      body: {success: true, data: {accepted: true}},
    })
    const previousDirectory = process.cwd()
    try {
      process.chdir(directory)
      const result = await withEnvironment(
        {
          POLYMORFA_API_KEY: undefined,
          POLYMORFA_PROJECT_TOKEN: undefined,
          POLYMORFA_CLIENT_TOKEN: undefined,
          POLYMORFA_BASE_URL: server.baseUrl,
          POLYMORFA_CONFIG_DIR: configDirectory,
        },
        () =>
          runCommand(
            'template submit template_123 --project-slug support --session number_123 --yes --json',
          ),
      )
      expect(result.error, result.stderr).toBeUndefined()
      expect(keyring).toHaveBeenCalledOnce()
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]).toMatchObject({
        method: 'POST',
        url: '/messaging/projects/support/templates/template_123/submit',
      })
    } finally {
      process.chdir(previousDirectory)
      keyring.mockRestore()
    }
  })

  test('edits a selected template language and reports acceptance', async () => {
    directory = await mkdtemp(
      join(homedir(), '.polymorfa-agent-work', 'cloud-cli-test-'),
    )
    const path = join(directory, 'edit.json')
    const body = {components: [{type: 'BODY', text: 'Ready'}]}
    await writeFile(path, JSON.stringify(body))
    server = await startHttpServer({
      status: 202,
      body: {
        success: true,
        data: {accepted: true, name: 'order/update', language: 'pt_BR'},
      },
    })
    const result = await credential(() =>
      runCommand(
        `cloud template edit order/update --session number --language pt_BR --input ${path} --json`,
      ),
    )
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: {accepted: true, language: 'pt_BR'},
      metadata: {status: 202},
    })
    expect(server.requests[0]).toMatchObject({
      method: 'PATCH',
      url: '/messaging/number/templates/order%2Fupdate?language=pt_BR',
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual(body)
  })

  test('rejects an edit containing a renamed template before dispatch', async () => {
    directory = await mkdtemp(
      join(homedir(), '.polymorfa-agent-work', 'cloud-cli-test-'),
    )
    const path = join(directory, 'invalid.json')
    await writeFile(path, JSON.stringify({name: 'renamed', components: [{}]}))
    server = await startHttpServer({body: {success: true}})
    const result = await credential(() =>
      runCommand(
        `cloud template edit order --session number --input ${path} --json`,
      ),
    )
    expect(exitCode(result.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test('preserves unknown sync evidence in the human QuickLink status', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: {
          id: 'ql_1',
          status: 'connected',
          session: 'number',
          purpose: 'reauthorization',
          onboarding: {
            sync: {
              contacts: {request: 'accepted', receiptRecorded: true},
              history: {
                request: 'unknown',
                receiptRecorded: false,
                delivery: 'unconfirmed',
              },
            },
          },
        },
      },
    })
    const result = await credential(
      () =>
        runCommand(
          'quicklink view ql_1 --project 11111111-1111-4111-8111-111111111111',
        ),
      'project',
    )
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.stdout).toContain(
      'Contacts request: accepted; receipt recorded: true',
    )
    expect(result.stdout).toContain(
      'History request: unknown; receipt recorded: false; delivery: unconfirmed',
    )
    expect(server.requests).toHaveLength(1)
  })

  test('forwards the inbound Official typing ID unchanged', async () => {
    server = await startHttpServer({
      body: {success: true, data: {status: 'OK'}},
    })
    const result = await credential(() =>
      runCommand(
        'message typing --session number --chat 730000000001 --id 740000000001 --state typing --json',
      ),
    )
    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/number/messages/typing',
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      conversation: {id: '730000000001'},
      id: '740000000001',
      state: 'typing',
    })
  })

  test('requires deletion confirmation before any request', async () => {
    server = await startHttpServer({body: {success: true}})
    const refused = await credential(() =>
      runCommand('cloud template delete order_update --session number --json'),
    )
    expect(refused.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
    const confirmed = await credential(() =>
      runCommand(
        'cloud template delete order_update --session number --yes --json',
      ),
    )
    expect(confirmed.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/number/templates/order_update',
    })
    expect(server.requests[0]!.headers['idempotency-key']).toBeUndefined()
  })

  test('preserves unknown service-window observations for a project token', async () => {
    const data = {
      state: 'unknown',
      reason: 'notifications_interrupted',
      openedAt: null,
      expiresAt: null,
      checkedAt: '2026-09-26T00:00:00Z',
    }
    server = await startHttpServer({body: {success: true, data}})
    const result = await credential(
      () =>
        runCommand(
          'cloud service-window +5511999999999 --session number --json',
        ),
      'project',
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(data)
    expect(server.requests[0]?.url).toBe(
      '/messaging/number/chats/%2B5511999999999/service-window',
    )
  })

  test('passes ISO pricing bounds and preserves unknown billing classifications', async () => {
    const data = {
      source: 'meta',
      messages: 1,
      groups: [
        {
          category: 'utility',
          pricingModel: 'PMP',
          pricingType: null,
          billable: null,
          messages: 1,
        },
      ],
    }
    server = await startHttpServer({body: {success: true, data}})
    const result = await credential(() =>
      runCommand(
        'cloud pricing --session number --since 2026-09-01T00:00:00Z --until 2026-09-26T00:00:00Z --json',
      ),
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(data)
    expect(server.requests[0]?.url).toBe(
      '/messaging/number/meta-pricing?since=2026-09-01T00%3A00%3A00Z&until=2026-09-26T00%3A00%3A00Z',
    )
  })

  test('reads health without starting reauthorization', async () => {
    server = await startHttpServer({
      body: {
        success: true,
        data: {status: 'action_required', failureCode: 'token_expired'},
      },
    })
    const result = await credential(() =>
      runCommand('cloud credentials get --session number --json'),
    )
    expect(result.error).toBeUndefined()
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/messaging/number/cloud-credentials',
    })
  })

  test('does not retry an uncertain reauthorization or stop the Number', async () => {
    server = await startHttpServer({
      status: 502,
      body: {error: {code: 'upstream_failure', message: 'Unknown'}},
    })
    const result = await credential(() =>
      runCommand('cloud credentials reauthorize --session number --json'),
    )
    expect(exitCode(result.error)).toBe(5)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/number/cloud-credentials/reauthorize',
    })
  })

  test('rejects client tokens before request dispatch', async () => {
    server = await startHttpServer({body: {success: true, data: {}}})
    const result = await credential(
      () => runCommand('cloud credentials get --session number --json'),
      'client',
    )
    expect(exitCode(result.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test.each([
    [403, 3],
    [409, 4],
    [503, 5],
  ])('preserves a %s API failure as exit %s', async (status, expected) => {
    server = await startHttpServer({
      status,
      body: {
        error: {
          code:
            status === 403
              ? 'feature_unavailable'
              : status === 409
                ? 'state_conflict'
                : 'service_unavailable',
          message: 'Unavailable',
        },
      },
    })
    const result = await credential(() =>
      runCommand('cloud credentials reauthorize --session number --json'),
    )
    expect(exitCode(result.error)).toBe(expected)
    expect(result.stdout).not.toContain('"success":true')
  })

  test('lists linked catalog products with an exact cursor', async () => {
    const data = {
      data: [{id: '111', retailer_id: 'sku-1', name: 'Mug'}],
      paging: {cursors: {after: 'next+/='}},
    }
    server = await startHttpServer({body: data})
    const result = await credential(
      () =>
        runCommand(
          'cloud catalog products --waba 1234 --catalog 98765432109876543210 --graph-version v26.0 --limit 10 --after next+/= --json',
        ),
      'project',
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(data)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/graph/whatsapp/v26.0/1234/product_catalogs/98765432109876543210/products?limit=10&after=next%2B%2F%3D',
    })
  })

  test('rejects a non-numeric catalog ID before any request', async () => {
    server = await startHttpServer({body: {data: []}})
    const result = await credential(() =>
      runCommand(
        'cloud catalog products --waba 1234 --catalog ../x --graph-version v26.0 --json',
      ),
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })

  test('reads raw Marketing Messages status strings without interpretation', async () => {
    const data = {
      id: '1234',
      marketing_messages_onboarding_status: 'ONBOARDED',
    }
    server = await startHttpServer({body: data})
    const result = await credential(
      () =>
        runCommand(
          'cloud marketing status --waba 1234 --graph-version v26.0 --json',
        ),
      'project',
    )
    expect(result.error).toBeUndefined()
    expect((JSON.parse(result.stdout) as {data: unknown}).data).toEqual(data)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: '/graph/whatsapp/v26.0/1234/marketing_messages/status',
    })
  })

  test('refuses marketing status for a client token before any request', async () => {
    server = await startHttpServer({body: {}})
    const result = await credential(
      () =>
        runCommand(
          'cloud marketing status --waba 1234 --graph-version v26.0 --json',
        ),
      'client',
    )
    expect(result.error).toBeDefined()
    expect(server.requests).toHaveLength(0)
  })

  async function credential<T>(
    run: () => Promise<T>,
    kind: 'api' | 'project' | 'client' = 'api',
  ) {
    if (!server) throw Error('Server is not started')
    return withEnvironment(
      {
        POLYMORFA_API_KEY:
          kind === 'api' ? `pmfa_${'A'.repeat(72)}` : undefined,
        POLYMORFA_PROJECT_TOKEN:
          kind === 'project' ? `pmfa_pt_${'A'.repeat(94)}` : undefined,
        POLYMORFA_CLIENT_TOKEN:
          kind === 'client' ? `pmfa_ct_${'A'.repeat(94)}` : undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
      },
      run,
    )
  }
})

function exitCode(error: unknown) {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
