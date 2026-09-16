import {chmod, lstat, readFile, symlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

import {
  loadCheckpoint,
  normalizeEventFilters,
  writeCheckpoint,
} from '../../src/listener/checkpoint.js'
import {temporaryDirectory} from '../support/fs.js'

const posixOnly = test.skipIf(process.platform === 'win32')

describe('listener checkpoints', () => {
  posixOnly(
    'creates and atomically updates a private normalized checkpoint',
    async () => {
      const directory = await temporaryDirectory()
      const path = join(directory, 'listen.json')
      const first = checkpoint({
        events: ['message.*', 'call.received', 'message.*'],
      })

      await writeCheckpoint(path, first)

      expect((await lstat(path)).mode & 0o777).toBe(0o600)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        ...first,
        filters: {events: ['call.received', 'message.*']},
      })
      await expect(
        loadCheckpoint(path, 'project_1', ['message.*', 'call.received']),
      ).resolves.toMatchObject({lastAcknowledgedCursor: 'cursor_1'})

      await writeCheckpoint(path, {
        ...first,
        lastAcknowledgedCursor: 'cursor_2',
      })
      await expect(
        loadCheckpoint(path, 'project_1', first.filters.events),
      ).resolves.toMatchObject({lastAcknowledgedCursor: 'cursor_2'})
    },
  )

  posixOnly(
    'rejects unsafe files and mismatched context before use',
    async () => {
      const directory = await temporaryDirectory()
      const path = join(directory, 'listen.json')
      await writeFile(path, JSON.stringify(checkpoint()))
      await chmod(path, 0o644)
      await expect(loadCheckpoint(path, 'project_1', [])).rejects.toThrow(
        '0600',
      )

      await chmod(path, 0o600)
      await expect(loadCheckpoint(path, 'different', [])).rejects.toThrow(
        'project',
      )

      const target = join(directory, 'target')
      const link = join(directory, 'link')
      await writeFile(target, '{}', {mode: 0o600})
      await symlink(target, link)
      await expect(loadCheckpoint(link, 'project_1', [])).rejects.toThrow(
        'regular',
      )
    },
  )

  test('does not apply POSIX mode bits on Windows', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'listen.json')
    await writeFile(path, JSON.stringify(checkpoint()))
    await chmod(path, 0o644)
    const platform = process.platform

    try {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: 'win32',
      })
      await expect(
        loadCheckpoint(path, 'project_1', []),
      ).resolves.toMatchObject({lastAcknowledgedCursor: 'cursor_1'})

      const writtenPath = join(directory, 'written-on-windows.json')
      await writeCheckpoint(writtenPath, checkpoint())
      await expect(
        loadCheckpoint(writtenPath, 'project_1', []),
      ).resolves.toMatchObject({lastAcknowledgedCursor: 'cursor_1'})
    } finally {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: platform,
      })
    }
  })

  test('normalizes filters without changing caller input', () => {
    const input = [' z.* ', 'a.b', 'z.*']
    expect(normalizeEventFilters(input)).toEqual(['a.b', 'z.*'])
    expect(input).toEqual([' z.* ', 'a.b', 'z.*'])
  })

  test('validates the complete listener filter grammar and byte limits', () => {
    expect(normalizeEventFilters([])).toEqual(['*'])
    expect(
      normalizeEventFilters([
        ' message.received ',
        'message.*',
        'message.received',
      ]),
    ).toEqual(['message.*', 'message.received'])

    for (const filter of [
      'Message.received',
      'message.*.received',
      'message.?',
      'message[0]',
    ]) {
      expect(() => normalizeEventFilters([filter])).toThrow(
        'listener event filter',
      )
    }
    expect(() => normalizeEventFilters(['a'.repeat(129)])).toThrow(
      '128 UTF-8 bytes',
    )
    expect(() =>
      normalizeEventFilters(
        Array.from({length: 33}, (_, index) => `event.${index}`),
      ),
    ).toThrow('32 unique')
    expect(() =>
      normalizeEventFilters(
        Array.from({length: 17}, (_, index) => `${'a'.repeat(124)}.${index}`),
      ),
    ).toThrow('2048 UTF-8 bytes')
  })
})

function checkpoint(filters = {events: [] as string[]}) {
  return {
    cursorExpiresAt: '2026-09-09T00:00:00.000Z',
    filters,
    kind: 'polymorfa_cli_listener_checkpoint' as const,
    lastAcknowledgedCursor: 'cursor_1',
    projectId: 'project_1',
    protocolVersion: '1' as const,
    schemaVersion: 1 as const,
    updatedAt: '2026-09-08T00:00:00.000Z',
  }
}
