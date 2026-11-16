import {describe, expect, test} from 'vitest'

import {renderCallActivity} from '../../src/output/calls.js'
import {renderValue} from '../../src/output/render.js'
import {renderCallParticipant} from '../../src/services/calls.js'

describe('untrusted guest labels', () => {
  test('quotes terminal controls in every human view while preserving JSON data', () => {
    const name = 'Ada\u009b31m\u202eGuest\u2066'
    const participant = {
      audioMuted: false,
      guest: true,
      id: '123',
      name,
      state: 'connected' as const,
      video: false,
    }
    const views = [
      renderCallActivity({
        callId: 'call_1',
        participant,
        type: 'participant_joined',
      }),
      renderCallActivity({
        callId: 'call_1',
        room: {
          enabled: true,
          inWaitingRoom: false,
          isAdmin: true,
          users: [participant],
        },
        type: 'waiting_room',
      }),
      renderCallParticipant(participant),
    ]
    expect(views.map((view) => /[\u009b\u202e\u2066]/u.test(view))).toEqual([
      false,
      false,
      false,
    ])
    for (const view of views)
      expect(view).toContain('Ada\\u009b31m\\u202eGuest\\u2066')
    expect(views[0]).toContain('participant=123')
    expect(views[2]).toContain('Participant\t123')
    expect(JSON.parse(renderValue(participant, 'json', views[2])!)).toEqual(
      participant,
    )
    expect(renderValue(participant, 'quiet', views[2])).toBeUndefined()
  })

  test('keeps ordinary Unicode names and absent-name behavior', () => {
    const participant = {
      id: '123',
      state: 'connected' as const,
      video: false,
      audioMuted: false,
    }
    const name = 'مرحبا café 👩‍💻'
    const namedParticipant = {...participant, name}
    expect(renderCallParticipant(namedParticipant)).toContain(
      `Name\t${JSON.stringify(name)}`,
    )
    expect(renderCallParticipant(participant)).not.toContain('Name\t')
  })
})
