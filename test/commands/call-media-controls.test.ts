import {describe, expect, test, vi} from 'vitest'
import {
  assertCallMediaMuteSupported,
  muteCallMedia,
} from '../../src/services/call-media-controls.js'

describe('connection-local call media mute', () => {
  test('refuses an older SDK before any call effect', () => {
    expect(() => assertCallMediaMuteSupported({})).toThrow(
      'published Calls SDK',
    )
  })
  test('sets only audioMuted and waits for authoritative confirmation', async () => {
    const setMediaState = vi.fn(() => Promise.resolve({audioMuted: true}))
    await muteCallMedia({setMediaState})
    expect(setMediaState).toHaveBeenCalledWith({audioMuted: true})
  })
  test('does not replay an uncertain media control', async () => {
    const setMediaState = vi.fn(() => Promise.reject(new Error('unknown')))
    await expect(muteCallMedia({setMediaState})).rejects.toThrow('unknown')
    expect(setMediaState).toHaveBeenCalledTimes(1)
  })
})
