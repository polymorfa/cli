import {Call} from '@polymorfa/sdk/calls'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'

interface ConnectionMediaControls {
  setMediaState(update: {audioMuted: boolean}): Promise<{audioMuted: boolean}>
}

export function assertCallMediaMuteSupported(
  candidate: object = Call.prototype,
): asserts candidate is ConnectionMediaControls {
  if (
    typeof (candidate as Partial<ConnectionMediaControls>).setMediaState !==
    'function'
  ) {
    throw new PolymorfaConfigurationError(
      'This CLI build needs a published Calls SDK with media-control support before --muted can be used.',
      'muted',
    )
  }
}

/** Set only the connection held by this Call; never target a foreign connection. */
export async function muteCallMedia(call: object): Promise<void> {
  assertCallMediaMuteSupported(call)
  const state = await call.setMediaState({audioMuted: true})
  if (!state.audioMuted) {
    throw new PolymorfaConfigurationError(
      'The call did not confirm the requested mute state.',
      'muted',
    )
  }
}
