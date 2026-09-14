import {PolymorfaConfigurationError} from '@polymorfa/sdk'

/** CLI input never accepts raw provider addresses. */
export function conversationReference(
  value: string,
): {id: string} | {phoneNumber: string} | {bsuid: string} {
  if (/^\+[1-9]\d{1,14}$/.test(value)) return {phoneNumber: value}
  if (/^[1-9]\d{0,18}$/.test(value)) return {id: value}
  if (/^[A-Z]{2}\.[A-Za-z0-9]{1,128}$/.test(value)) return {bsuid: value}
  throw new PolymorfaConfigurationError(
    'Use a Polymorfa conversation ID, E.164 phone number, or BSUID.',
    'conversation',
  )
}
