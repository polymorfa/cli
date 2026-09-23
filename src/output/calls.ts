import type {CallActivity, CallsStatus} from '../services/calls.js'

/** An abort signal for Ctrl-C and SIGTERM, removed when the command ends. */
export function stopOnSignals(): {
  readonly dispose: () => void
  readonly signal: AbortSignal
} {
  const controller = new AbortController()
  const stop = (): void => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  return {
    dispose: () => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    },
    signal: controller.signal,
  }
}

export function renderCallsStatus(
  status: CallsStatus,
  session: string | undefined,
): string {
  switch (status.type) {
    case 'ready':
      return `Following calls${session === undefined ? '' : ` for session ${session}`}${status.participant === undefined ? '' : ` as ${status.participant}`}. Press Ctrl-C to stop.`
    case 'disconnected':
      return 'Disconnected from calls; reconnecting.'
    case 'notice':
      return `Warning: ${status.message} (${status.code})`
  }
}

export function renderCallActivity(activity: CallActivity): string {
  const fields: string[] = [activity.type, activity.callId]
  switch (activity.type) {
    case 'incoming':
      fields.push(
        `from=${activity.peer || 'unknown'}`,
        `video=${activity.video}`,
      )
      break
    case 'claim':
      fields.push(
        `answered=${activity.answered}`,
        `answeredBy=${activity.answeredBy ?? ''}`,
        `exclusive=${activity.exclusive}`,
        `claimedByOther=${activity.claimedByOther}`,
      )
      break
    case 'state':
      fields.push(`${activity.previous}->${activity.state}`)
      break
    case 'participant_joined':
    case 'participant_state':
      fields.push(
        `participant=${activity.participant.id}`,
        `state=${activity.participant.state}`,
      )
      break
    case 'participant_left':
      fields.push(`participant=${activity.participantId}`)
      if (activity.reason !== undefined)
        fields.push(`reason=${activity.reason}`)
      break
    case 'ended':
      fields.push(`reason=${activity.reason}`, `duration=${activity.duration}s`)
      break
  }
  return fields.join('\t')
}
