import {afterEach, expect, test, vi} from 'vitest'
import {COMMAND_LOADERS} from '../../src/browser/registry.gen.js'
import {runCommand} from '../../src/browser/index.js'

const tripwires = vi.hoisted(() => ({
  probe: vi.fn(() => {
    throw new Error('local filesystem/client config probe')
  }),
  spawn: vi.fn(() => {
    throw new Error('local installer process')
  }),
  module: vi.fn(() => {
    throw new Error('local installer module evaluated')
  }),
}))
vi.mock('node:fs/promises', () => ({
  access: tripwires.probe,
  stat: tripwires.probe,
  readFile: tripwires.probe,
}))
vi.mock('node:child_process', () => ({
  spawn: tripwires.spawn,
  execFile: tripwires.spawn,
}))
vi.mock('../../src/services/agent-setup.js', () => {
  tripwires.module()
  return {}
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test.each([
  ['agent', 'setup', '--yes'],
  ['agent', 'setup', '--dry-run'],
])(
  'refuses %j before loading or probing local installer code',
  async (...words) => {
    const loader = vi
      .spyOn(COMMAND_LOADERS, 'agent setup')
      .mockRejectedValue(new Error('installer loader must not be called'))
    const fetch = vi.fn<typeof globalThis.fetch>()
    const output: string[] = []
    const result = await runCommand(words, {
      env: {},
      fetch,
      write: (_stream, text) => output.push(text),
    })
    expect(result).toEqual({exitCode: 1, command: 'agent setup'})
    expect(output.join('')).toContain('needs the installed Polymorfa CLI')
    expect(output.join('')).toContain('configures coding agents')
    expect(loader).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(tripwires.probe).not.toHaveBeenCalled()
    expect(tripwires.spawn).not.toHaveBeenCalled()
    expect(tripwires.module).not.toHaveBeenCalled()
  },
)
test('the real generated inventory and local-only module tripwires need no caller environment', async () => {
  const output: string[] = []
  const result = await runCommand(['agent', 'setup'], {
    get env(): never {
      throw new Error('caller credentials/configuration read')
    },
    get fetch(): never {
      throw new Error('fetch touched before local refusal')
    },
    write: (_stream, text) => output.push(text),
  })
  expect(result).toEqual({exitCode: 1, command: 'agent setup'})
  expect(output.join('')).toContain('configures coding agents')
  expect(tripwires.probe).not.toHaveBeenCalled()
  expect(tripwires.spawn).not.toHaveBeenCalled()
  expect(tripwires.module).not.toHaveBeenCalled()
})
