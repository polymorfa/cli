import {
  PolymorfaConfigurationError,
  type MessagingClient,
  type RejectCallResponse,
  type RequestOptions,
  type ResolveLidParams,
  type ResolveLidResult,
  type ResponseMetadata,
  type UserSecurityCode,
} from '@polymorfa/sdk'

export interface SessionIdentityResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function rejectCall(
  client: MessagingClient,
  session: string,
  callId: string,
  from: string,
  options: RequestOptions = {},
): Promise<SessionIdentityResult<RejectCallResponse>> {
  if (callId.length === 0) {
    throw new PolymorfaConfigurationError('Call ID cannot be empty.', 'call')
  }
  if (callId.length > 128) {
    throw new PolymorfaConfigurationError(
      'Call ID cannot exceed 128 characters.',
      'call',
    )
  }
  if (from.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Incoming caller JID cannot be empty.',
      'from',
    )
  }

  const response = await client.calls.reject(
    session,
    callId,
    {from: from.trim()},
    options,
  )
  return result(response.data, response.metadata)
}

export async function resolveLid(
  client: MessagingClient,
  session: string,
  input: {
    readonly id?: string
    readonly lid?: string
    readonly phoneNumber?: string
    readonly username?: string
    readonly usernameKey?: string
  },
): Promise<SessionIdentityResult<ResolveLidResult>> {
  const response = await client.lids.resolve(session, lidParams(input))
  return result(response.data.data, response.metadata)
}

export async function viewUserSecurityCode(
  client: MessagingClient,
  session: string,
  userId: string,
): Promise<SessionIdentityResult<UserSecurityCode>> {
  validateLid(userId, 'User ID')
  const response = await client.users.getSecurityCode(session, userId)
  return result(response.data.data, response.metadata)
}

export function renderResolvedLid(identity: ResolveLidResult): string {
  const rows = [
    row('ID', identity.id ?? identity.lid),
    row('Phone', identity.phoneNumber),
    row('Username', identity.username),
    identity.keyRequired === undefined
      ? undefined
      : row('Username key required', identity.keyRequired ? 'yes' : 'no'),
  ].filter((value): value is string => value !== undefined)
  return rows.length === 0
    ? 'The identity resolved without public identifiers.'
    : rows.join('\n')
}

export function renderUserSecurityCode(code: UserSecurityCode): string {
  return [
    row('ID', code.id),
    row('Phone', code.phoneNumber),
    row('Username', code.username),
    row('Numeric code', code.numericCode),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderCallRejection(response: RejectCallResponse): string {
  if ('data' in response && 'requestId' in response.data) {
    return `Accepted call rejection as request ${response.data.requestId}.`
  }
  return 'Rejected the incoming call.'
}

function lidParams(input: {
  readonly id?: string
  readonly lid?: string
  readonly phoneNumber?: string
  readonly username?: string
  readonly usernameKey?: string
}): ResolveLidParams {
  const identities = [
    input.phoneNumber,
    input.id,
    input.lid,
    input.username,
  ].filter((value) => value !== undefined)
  if (identities.length !== 1) {
    throw new PolymorfaConfigurationError(
      'Provide exactly one of --phone-number, --id, --lid, or --username.',
      'identity',
    )
  }

  if (input.phoneNumber !== undefined) {
    const phoneNumber = input.phoneNumber.trim()
    if (!/^\+?\d+$/.test(phoneNumber)) {
      throw new PolymorfaConfigurationError(
        'Phone number must contain digits with an optional leading plus sign.',
        'phoneNumber',
      )
    }
    return {phoneNumber}
  }
  if (input.id !== undefined) {
    validateLid(input.id, 'LID')
    return {id: input.id}
  }
  if (input.lid !== undefined) {
    validateLid(input.lid, 'LID')
    return {lid: input.lid}
  }

  const username = input.username!
  if (username.length < 3 || username.length > 35) {
    throw new PolymorfaConfigurationError(
      'Username must contain 3 through 35 characters.',
      'username',
    )
  }
  if (input.usernameKey !== undefined && !/^\d{4}$/.test(input.usernameKey)) {
    throw new PolymorfaConfigurationError(
      'Username key must contain exactly four digits.',
      'usernameKey',
    )
  }
  return {
    username,
    ...(input.usernameKey === undefined
      ? {}
      : {usernameKey: input.usernameKey}),
  }
}

function validateLid(value: string, label: string): void {
  if (!/^\d+@lid$/.test(value)) {
    throw new PolymorfaConfigurationError(
      `${label} must use the digits@lid form.`,
      'id',
    )
  }
}

function row(label: string, value: string | undefined): string | undefined {
  return value === undefined || value.length === 0
    ? undefined
    : `${label}\t${value}`
}

function result<T>(
  data: T,
  metadata: ResponseMetadata,
): SessionIdentityResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  }
}
