import {fileURLToPath} from 'node:url'
import AgentSetup from '../../src/commands/agent/setup.js'
import {beforeEach, expect, test, vi} from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
vi.mock('node:child_process', () => ({
  spawn: () => {
    throw new Error('Real child processes are forbidden in this test')
  },
}))

const mocks = vi.hoisted(() => ({detectClients: vi.fn(), setupAgents: vi.fn()}))
vi.mock('../../src/services/agent-setup.js', () => ({
  CLIENTS: ['claude', 'codex', 'gemini', 'cursor'],
  ...mocks,
}))
beforeEach(() => {
  mocks.detectClients.mockResolvedValue(['claude'])
  mocks.setupAgents.mockResolvedValue([{client: 'claude', status: 'dry-run'}])
})
test('limits to repeatable requested clients and passes dry-run', async () => {
  await AgentSetup.run(
    ['--client', 'claude', '--client', 'codex', '--dry-run'],
    root,
  )
  expect(mocks.detectClients).not.toHaveBeenCalled()
  expect(mocks.setupAgents).toHaveBeenCalledWith(
    expect.objectContaining({clients: ['claude', 'codex'], dryRun: true}),
  )
})
test('uses detection by default', async () => {
  await AgentSetup.run(['--dry-run'], root)
  expect(mocks.setupAgents).toHaveBeenCalledWith(
    expect.objectContaining({clients: ['claude']}),
  )
})
test('partial failure exits with status 1', async () => {
  mocks.setupAgents.mockResolvedValue([
    {client: 'claude', status: 'installed'},
    {client: 'codex', status: 'failed'},
  ])
  await expect(AgentSetup.run(['--yes'], root)).rejects.toMatchObject({
    oclif: {exit: 1},
  })
})
test('rejects invalid client before setup', async () => {
  await expect(
    AgentSetup.run(['--client', 'unknown', '--yes'], root),
  ).rejects.toBeDefined()
  expect(mocks.setupAgents).not.toHaveBeenCalled()
})
