import {Readable} from 'node:stream'
import {describe, expect, test, vi} from 'vitest'
import {
  assertWaitingRoomSupported,
  moderateWaitingRoom,
  waitingRoomCommands,
} from '../../src/services/call-media-controls.js'

describe('live guest moderation', () => {
  test('refuses old SDKs before a connection', () => {
    expect(() => assertWaitingRoomSupported({})).toThrow('published Calls SDK')
  })
  test('uses the held connection and never retries an unknown outcome', async () => {
    const admitParticipant = vi.fn(() =>
      Promise.reject(new Error('waiting_room_control_unknown')),
    )
    const call = {
      setApprovalRequired: vi.fn(),
      admitParticipant,
      denyParticipant: vi.fn(),
    }
    await expect(
      moderateWaitingRoom(call, {action: 'admit', participantId: '123'}),
    ).rejects.toThrow('unknown')
    expect(admitParticipant).toHaveBeenCalledExactlyOnceWith('123')
    expect(call.denyParticipant).not.toHaveBeenCalled()
  })
  test('reads strict commands separately from PCM', async () => {
    const commands = []
    for await (const command of waitingRoomCommands(
      Readable.from([
        Buffer.from(
          '{"action":"admit","participantId":"123"}\n{"action":"set_approval_required","enabled":true}\n',
        ),
      ]),
    ))
      commands.push(command)
    expect(commands).toEqual([
      {action: 'admit', participantId: '123'},
      {action: 'set_approval_required', enabled: true},
    ])
  })
  test.each([
    '{"action":"admit","participantId":"123@lid"}',
    '{"action":"deny","participantId":"123","connectionId":"foreign"}',
    'x'.repeat(4097),
  ])('rejects invalid or unbounded commands', async (line) => {
    await expect(
      (async () => {
        for await (const _ of waitingRoomCommands(
          Readable.from([Buffer.from(line)]),
        )) {
          void _
        }
      })(),
    ).rejects.toThrow()
  })
})
