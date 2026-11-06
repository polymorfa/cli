import {Flags} from '@oclif/core'

export const PHONE_OFFLINE_EVENT = 'session.phone_offline'
const MIN_DAY = 7
const MAX_DAY = 13

/** A day from 7 to 13, or off to unsubscribe from the warning. */
export type PhoneOfflineStartDay = number | 'off'

function parseStartDay(value: string): PhoneOfflineStartDay {
  if (value === 'off') return 'off'
  const day = Number(value)
  if (!/^\d+$/.test(value) || day < MIN_DAY || day > MAX_DAY) {
    throw new Error(`Expected a day from ${MIN_DAY} to ${MAX_DAY}, or off.`)
  }
  return day
}

export const phoneOfflineStartDayFlag = Flags.custom<PhoneOfflineStartDay>({
  description: `First day without the phone on which the webhook receives ${PHONE_OFFLINE_EVENT} (${MIN_DAY}-${MAX_DAY}), or off to remove that event. WhatsApp signs the device out on day 14.`,
  parse: (value) => Promise.resolve(parseStartDay(value)),
})()

/**
 * Merge the flag into a webhook body. A day sets phoneOfflineStartDay; off
 * removes the event from eventTypes, read from the body or else the saved
 * webhook. Platform webhooks need at least one event, so off cannot empty it.
 */
export function withPhoneOfflineStartDay(
  body: Readonly<Record<string, unknown>>,
  value: PhoneOfflineStartDay,
  savedEventTypes?: readonly string[],
): Record<string, unknown> {
  if (value !== 'off') return {...body, phoneOfflineStartDay: value}
  const eventTypes = Array.isArray(body.eventTypes)
    ? (body.eventTypes as unknown[]).map(String)
    : savedEventTypes
  if (eventTypes === undefined) {
    throw new Error('Add eventTypes to the input before using off.')
  }
  const remaining = eventTypes.filter((event) => event !== PHONE_OFFLINE_EVENT)
  if (remaining.length === 0) {
    throw new Error(
      `A webhook needs at least one event besides ${PHONE_OFFLINE_EVENT}. Delete or disable the webhook instead.`,
    )
  }
  return {...body, eventTypes: remaining}
}
