import {describe, expect, test, vi} from 'vitest'
import type {MessagingClient} from '@polymorfa/sdk'
import {reactToCall, setCallHand} from '../../src/services/calls.js'
const credential = {type: 'apiKey' as const, value: 'unused'}
const response = {
  data: {success: true},
  metadata: {status: 202, attempts: 1, headers: {}},
}

describe('call reaction and hand commands', () => {
  test('validates connection ownership input and dispatches a single typed SDK request', async () => {
    const sendReaction = vi.fn(() => Promise.resolve(response))
    const setHandRaised = vi.fn(() => Promise.resolve(response))
    const client = {
      voip: {sendReaction, setHandRaised},
    } as unknown as MessagingClient
    await reactToCall(client, credential, 'call-1', {
      connectionId: 'connection-1',
      emoji: '👍',
      participant: 'agent',
    })
    await reactToCall(client, credential, 'call-1', {
      connectionId: 'connection-1',
      emoji: '',
    })
    await setCallHand(client, credential, 'call-1', {
      connectionId: 'connection-1',
      raised: false,
    })
    expect(sendReaction).toHaveBeenNthCalledWith(1, 'call-1', {
      connectionId: 'connection-1',
      emoji: '👍',
      participant: 'agent',
    })
    expect(setHandRaised).toHaveBeenCalledWith('call-1', {
      connectionId: 'connection-1',
      raised: false,
    })
    await expect(
      reactToCall(client, credential, 'call-1', {
        connectionId: 'connection-1',
        emoji: 'plain text',
      }),
    ).rejects.toThrow('Reaction must')
    await expect(
      setCallHand(client, {type: 'clientToken', value: 'unused'}, 'call-1', {
        connectionId: 'connection-1',
        raised: true,
        participant: 'other',
      }),
    ).rejects.toThrow('Client tokens')
    expect(sendReaction).toHaveBeenCalledTimes(2)
  })
  test('refuses an older published SDK explicitly and never retries uncertain sends', async () => {
    await expect(
      reactToCall({voip: {}} as MessagingClient, credential, 'call-1', {
        connectionId: 'connection-1',
        emoji: '👍',
      }),
    ).rejects.toThrow('published SDK version')
    const sendReaction = vi.fn(() =>
      Promise.reject(new Error('lost after send')),
    )
    const client = {
      voip: {sendReaction, setHandRaised: vi.fn()},
    } as unknown as MessagingClient
    await expect(
      reactToCall(client, credential, 'call-1', {
        connectionId: 'connection-1',
        emoji: '👍',
      }),
    ).rejects.toThrow()
    expect(sendReaction).toHaveBeenCalledTimes(1)
  })
})
