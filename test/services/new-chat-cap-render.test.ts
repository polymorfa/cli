import type {Connection} from '@polymorfa/sdk'
import {describe, expect, test} from 'vitest'

import {renderManagedConnection} from '../../src/services/platform-management.js'

const base = {
  connectionId: 'session_1',
  name: 'Support',
  tenantId: 'team_1',
  type: 'linked_device',
  testMode: false,
  status: 'CONNECTED',
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
} as unknown as Connection

const cap = (newChatCapping: unknown) =>
  renderManagedConnection({...base, newChatCapping} as unknown as Connection)
    .split('\n')
    .find((line) => line.startsWith('New-chat cap'))

describe('connection view new-chat cap line', () => {
  test('omits the line when the API returned no field', () => {
    expect(renderManagedConnection(base)).not.toContain('New-chat cap')
  })

  test('describes each WhatsApp state', () => {
    const on = {
      enabled: true,
      capped: false,
      limit: 50,
      used: 26,
      resetsAt: '2026-10-01T00:00:00.000Z',
    }
    expect(cap(null)).toBe('New-chat cap\tnot observed yet')
    expect(cap({...on, enabled: null})).toBe('New-chat cap\tundetermined')
    expect(cap({...on, enabled: false})).toBe(
      'New-chat cap\tnot enabled by WhatsApp',
    )
    expect(cap(on)).toBe(
      'New-chat cap\t26 of 50 used until 2026-10-01T00:00:00.000Z',
    )
    expect(cap({...on, capped: true, used: 50})).toBe(
      'New-chat cap\tcapped until 2026-10-01T00:00:00.000Z',
    )
    expect(cap({...on, limit: null, used: null, resetsAt: null})).toBe(
      'New-chat cap\tenabled by WhatsApp',
    )
  })
})
