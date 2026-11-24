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

export interface WaitingRoomCommand {
  readonly action: 'set_approval_required' | 'admit' | 'deny'
  readonly enabled?: boolean
  readonly participantId?: string
}
interface WaitingRoomControls {
  setApprovalRequired(enabled: boolean): Promise<void>
  admitParticipant(participantId: string): Promise<void>
  denyParticipant(participantId: string): Promise<void>
}

export function assertWaitingRoomSupported(
  candidate: object = Call.prototype,
): asserts candidate is WaitingRoomControls {
  const controls = candidate as Partial<WaitingRoomControls>
  if (
    typeof controls.setApprovalRequired !== 'function' ||
    typeof controls.admitParticipant !== 'function' ||
    typeof controls.denyParticipant !== 'function'
  ) {
    throw new PolymorfaConfigurationError(
      'This CLI build needs a published Calls SDK with waiting-room support before --control-input can be used.',
      'control-input',
    )
  }
}

/** One command uses only the Call's current media connection. Never retry it. */
export async function moderateWaitingRoom(
  call: object,
  command: WaitingRoomCommand,
): Promise<void> {
  assertWaitingRoomSupported(call)
  if (command.action === 'set_approval_required')
    await call.setApprovalRequired(command.enabled!)
  else if (command.action === 'admit')
    await call.admitParticipant(command.participantId!)
  else await call.denyParticipant(command.participantId!)
}

/** Read bounded UTF-8 JSON lines from a file or pipe, separate from PCM input. */
export async function* waitingRoomCommands(
  input: AsyncIterable<Uint8Array>,
): AsyncGenerator<WaitingRoomCommand> {
  const decoder = new TextDecoder('utf-8', {fatal: true})
  let pending = ''
  function parse(line: string): WaitingRoomCommand {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw invalidControl()
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw invalidControl()
    const command = value as Record<string, unknown>
    const keys = Object.keys(command).sort().join(',')
    if (
      command.action === 'set_approval_required' &&
      keys === 'action,enabled' &&
      typeof command.enabled === 'boolean'
    )
      return {action: command.action, enabled: command.enabled}
    if (
      (command.action === 'admit' || command.action === 'deny') &&
      keys === 'action,participantId' &&
      typeof command.participantId === 'string' &&
      /^[1-9][0-9]{0,18}$/.test(command.participantId)
    )
      return {action: command.action, participantId: command.participantId}
    throw invalidControl()
  }
  for await (const chunk of input) {
    // Process pieces so one large read never grows the pending line without bound.
    for (let offset = 0; offset < chunk.length; offset += 1024) {
      pending += decoder.decode(chunk.subarray(offset, offset + 1024), {
        stream: true,
      })
      let newline: number
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim()
        if (newline > 4096) throw invalidControl()
        pending = pending.slice(newline + 1)
        if (line) yield parse(line)
      }
      if (pending.length > 4096) throw invalidControl()
    }
  }
  pending += decoder.decode()
  if (pending.trim()) yield parse(pending.trim())
}
function invalidControl(): PolymorfaConfigurationError {
  return new PolymorfaConfigurationError(
    'Expected a JSON line with action set_approval_required and enabled, or action admit/deny and a public participantId. Lines must be at most 4096 characters.',
    'control-input',
  )
}

export interface CallWaitingRoom {
  readonly enabled: boolean
  readonly isAdmin: boolean
  readonly inWaitingRoom: boolean
  readonly users: readonly {
    readonly id: string
    readonly state: string
    readonly guest?: boolean
    readonly name?: string
  }[]
}
export function observeWaitingRoom(
  call: object,
  listener: (state: CallWaitingRoom) => void,
): void {
  ;(
    call as {
      on(event: 'waitingRoom', listener: (state: CallWaitingRoom) => void): void
    }
  ).on('waitingRoom', listener)
}
