import {runCommand} from '@oclif/test'
import {expect, test} from 'vitest'
import {
  startHttpSequenceServer,
  withEnvironment,
} from '../helpers/http-server.js'

const key = `pmfa_${'A'.repeat(72)}`
function environment(
  baseUrl: string,
  run: () => Promise<unknown>,
  client = false,
) {
  return withEnvironment(
    {
      POLYMORFA_API_KEY: client ? undefined : key,
      POLYMORFA_BASE_URL: baseUrl,
      POLYMORFA_PROJECT_TOKEN: undefined,
      POLYMORFA_CLIENT_TOKEN: client ? `pmfa_ct_${'A'.repeat(94)}` : undefined,
    },
    run,
  )
}
for (const accountType of [
  'whatsapp_app',
  'business_app',
  'meta_cloud',
  'meta_coexistence',
]) {
  test(`changes Test account mode ${accountType} using the installed transport`, async () => {
    const reply = {
      session: 'demo/a',
      accountType,
      primaryPlatform: accountType === 'meta_cloud' ? null : 'android',
      changed: true,
      unlinkedDevices: [2, 7],
    }
    const server = await startHttpSequenceServer([
      {body: reply, headers: {'request-id': 'mode-request'}},
    ])
    try {
      await environment(server.baseUrl, async () => {
        const result = await runCommand(
          `testing account-mode demo/a --account-type ${accountType} --yes --json`,
        )
        expect(result.error, result.stderr).toBeUndefined()
        expect(JSON.parse(result.stdout)).toMatchObject({
          data: reply,
          metadata: {status: 200, requestId: 'mode-request'},
        })
      })
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]).toMatchObject({
        method: 'PUT',
        url: '/messaging/demo%2Fa/phone/account-mode',
      })
      expect(JSON.parse(server.requests[0]!.body)).toEqual({accountType})
      expect(server.requests[0]!.headers.authorization).toBe(`Bearer ${key}`)
    } finally {
      await server.close()
    }
  })
}
test('keeps iOS and a completed unchanged result', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        session: 'demo',
        accountType: 'business_app',
        primaryPlatform: 'ios',
        changed: false,
        unlinkedDevices: [],
      },
    },
  ])
  try {
    await environment(server.baseUrl, async () => {
      const result = await runCommand(
        'testing account-mode demo --account-type business_app --primary-platform ios --yes',
      )
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.stdout).toContain('already business_app')
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      accountType: 'business_app',
      primaryPlatform: 'ios',
    })
  } finally {
    await server.close()
  }
})
for (const args of [
  '--account-type business',
  '--account-type business_app',
  '--account-type meta_cloud --primary-platform android --yes',
]) {
  test(`rejects invalid or unconfirmed mode before I/O: ${args}`, async () => {
    const server = await startHttpSequenceServer([{body: {}}])
    try {
      await environment(server.baseUrl, async () => {
        const result = await runCommand(`testing account-mode demo ${args}`)
        expect(result.error).toBeDefined()
      })
      expect(server.requests).toHaveLength(0)
    } finally {
      await server.close()
    }
  })
}
test('rejects client credentials before I/O', async () => {
  const server = await startHttpSequenceServer([{body: {}}])
  try {
    await environment(
      server.baseUrl,
      async () => {
        const result = await runCommand(
          'testing account-mode demo --account-type business_app --yes',
        )
        expect(result.error).toBeDefined()
      },
      true,
    )
    expect(server.requests).toHaveLength(0)
  } finally {
    await server.close()
  }
})
test('rejects malformed mode responses', async () => {
  const server = await startHttpSequenceServer([{body: {session: 'demo'}}])
  try {
    await environment(server.baseUrl, async () => {
      const result = await runCommand(
        'testing account-mode demo --account-type business_app --yes',
      )
      expect(result.error).toBeDefined()
      expect(result.stderr).toContain('invalid testing account-mode result')
    })
    expect(server.requests).toHaveLength(1)
  } finally {
    await server.close()
  }
})
test('creates a Test QuickLink with mode-specific flags', async () => {
  const server = await startHttpSequenceServer([
    {
      body: {
        success: true,
        data: {
          id: 'ql',
          url: 'https://example.test/ql',
          session: 'demo',
          expiresAt: null,
        },
      },
    },
  ])
  try {
    await environment(server.baseUrl, async () => {
      const result = await runCommand(
        'quicklink create --project 11111111-1111-4111-8111-111111111111 --account-type business_app --primary-platform ios --json',
      )
      expect(result.error, result.stderr).toBeUndefined()
    })
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      projectId: '11111111-1111-4111-8111-111111111111',
      configuration: {
        testing: {
          configuration: {accountType: 'business_app', primaryPlatform: 'ios'},
        },
      },
    })
  } finally {
    await server.close()
  }
})
