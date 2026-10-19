import {describe, expect, test, vi} from 'vitest'
import {
  detectClients,
  setupAgents,
  type ProcessRunner,
  type SetupOptions,
} from '../../src/services/agent-setup.js'

const nativeHelp = 'plugin add PLUGIN Git marketplace'
function harness(overrides: Partial<SetupOptions> = {}) {
  const runner = vi.fn<ProcessRunner>((_binary, args) =>
    Promise.resolve({
      code: 0,
      stdout: args.includes('--help') ? nativeHelp : '[]',
    }),
  )
  const log = vi.fn<(message: string) => void>()
  const confirm = vi.fn(() => Promise.resolve(true))
  const options: SetupOptions = {
    clients: ['claude', 'codex', 'gemini', 'cursor'],
    dryRun: false,
    yes: true,
    runner,
    log,
    confirm,
    exists: () => Promise.resolve(true),
    cursorConfig: () => Promise.resolve(false),
    ...overrides,
  }
  return {runner, log, confirm, options}
}

describe('agent setup', () => {
  test('detects binaries and Cursor configuration without reading configuration', async () => {
    expect(
      await detectClients(
        (name) => Promise.resolve(name === 'claude' || name === 'codex'),
        () => Promise.resolve(true),
      ),
    ).toEqual(['claude', 'codex', 'cursor'])
    expect(
      await detectClients(
        () => Promise.resolve(false),
        () => Promise.resolve(false),
      ),
    ).toEqual([])
  })
  test('dry-run prints exact commands and never calls mutation or listing commands', async () => {
    const {runner, log, confirm, options} = harness({dryRun: true})
    expect((await setupAgents(options)).map((item) => item.status)).toEqual([
      'dry-run',
      'dry-run',
      'dry-run',
      'instructions',
    ])
    expect(log.mock.calls.map(([message]) => message)).toEqual(
      expect.arrayContaining([
        'claude plugin marketplace add polymorfa/agent-kit',
        'claude plugin install polymorfa@polymorfa',
        'codex plugin marketplace add polymorfa/agent-kit',
        'codex plugin add polymorfa@polymorfa',
        'gemini extensions install https://github.com/polymorfa/agent-kit --consent',
      ]),
    )
    expect(runner.mock.calls.every(([, args]) => args.includes('--help'))).toBe(
      true,
    )
    expect(confirm).not.toHaveBeenCalled()
  })
  test('unsupported Codex receives instructions without configuration edits', async () => {
    const {runner, options} = harness({clients: ['codex']})
    runner.mockResolvedValue({code: 1, stdout: ''})
    expect(await setupAgents(options)).toEqual([
      {client: 'codex', status: 'instructions'},
    ])
    expect(runner.mock.calls.every(([, args]) => args.includes('--help'))).toBe(
      true,
    )
  })
  test('confirms before mutation and declines without calling any client', async () => {
    const {runner, confirm, options} = harness({
      clients: ['claude'],
      yes: false,
    })
    confirm.mockResolvedValue(false)
    expect(await setupAgents(options)).toEqual([
      {client: 'claude', status: 'failed'},
    ])
    expect(runner).not.toHaveBeenCalled()
    confirm.mockResolvedValue(true)
    expect(await setupAgents(options)).toEqual([
      {client: 'claude', status: 'installed'},
    ])
    expect(runner).toHaveBeenCalledWith('claude', [
      'plugin',
      'install',
      'polymorfa@polymorfa',
    ])
  })
  test('reports partial failure and continues without exposing child output or exceptions', async () => {
    const {runner, log, options} = harness({clients: ['claude', 'gemini']})
    runner.mockImplementation((binary) =>
      binary === 'claude'
        ? Promise.reject(new Error('secret-value'))
        : Promise.resolve({code: 0, stdout: ''}),
    )
    expect((await setupAgents(options)).map((item) => item.status)).toEqual([
      'failed',
      'installed',
    ])
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-value')
  })
  test('requested missing client fails while config-only Cursor receives instructions', async () => {
    const {options} = harness({
      clients: ['claude', 'cursor'],
      exists: () => Promise.resolve(false),
      cursorConfig: () => Promise.resolve(true),
    })
    expect((await setupAgents(options)).map((item) => item.status)).toEqual([
      'failed',
      'instructions',
    ])
  })
  test.each(['claude', 'codex', 'gemini'] as const)(
    'repeat installation is idempotent for %s',
    async (client) => {
      const {runner, options} = harness({clients: [client]})
      let installed = false
      runner.mockImplementation((_binary, args) => {
        if (args.includes('--help'))
          return Promise.resolve({code: 0, stdout: nativeHelp})
        if (args.includes('list'))
          return Promise.resolve({
            code: 0,
            stdout:
              client === 'gemini'
                ? installed
                  ? '✓ polymorfa (0.1.0)'
                  : ''
                : args.includes('marketplace')
                  ? '[]'
                  : installed
                    ? client === 'claude'
                      ? '[{"id":"polymorfa@polymorfa"}]'
                      : '{"installed":[{"name":"polymorfa","marketplaceName":"polymorfa"}]}'
                    : '[]',
          })
        if (
          args.includes('install') ||
          (args[0] === 'plugin' && args[1] === 'add')
        )
          installed = true
        return Promise.resolve({code: 0, stdout: ''})
      })
      expect(await setupAgents(options)).toEqual([
        {client, status: 'installed'},
      ])
      const calls = runner.mock.calls.length
      expect(await setupAgents(options)).toEqual([
        {client, status: 'already installed'},
      ])
      expect(
        runner.mock.calls
          .slice(calls)
          .every(
            ([, args]) => args.includes('list') || args.includes('--help'),
          ),
      ).toBe(true)
    },
  )
  test('preserves an existing marketplace and refuses a conflicting source', async () => {
    const {runner, options} = harness({clients: ['codex']})
    runner.mockImplementation((_binary, args) =>
      Promise.resolve({
        code: 0,
        stdout: args.includes('--help')
          ? nativeHelp
          : args.includes('marketplace')
            ? '{"marketplaces":[{"name":"polymorfa","marketplaceSource":{"source":"polymorfa/agent-kit"}}]}'
            : '{"installed":[]}',
      }),
    )
    expect((await setupAgents(options))[0]?.status).toBe('installed')
    expect(
      runner.mock.calls.some(
        ([, args]) => args.includes('marketplace') && args.includes('add'),
      ),
    ).toBe(true) // help probe only
    expect(
      runner.mock.calls
        .filter(([, args]) => !args.includes('--help'))
        .some(
          ([, args]) => args.includes('marketplace') && args.includes('add'),
        ),
    ).toBe(false)
    runner.mockImplementation((_binary, args) =>
      Promise.resolve({
        code: 0,
        stdout: args.includes('--help')
          ? nativeHelp
          : args.includes('marketplace')
            ? '{"marketplaces":[{"name":"polymorfa","marketplaceSource":{"source":"someone/else"}}]}'
            : '{"installed":[]}',
      }),
    )
    expect((await setupAgents(options))[0]?.status).toBe('failed')
  })
  test('nonzero child installation fails that client', async () => {
    const {runner, options} = harness({clients: ['claude']})
    runner.mockImplementation((_binary, args) =>
      Promise.resolve({
        code: args.includes('install') ? 1 : 0,
        stdout: '[]',
      }),
    )
    expect((await setupAgents(options))[0]?.status).toBe('failed')
  })
})
