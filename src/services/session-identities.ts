import {
  PolymorfaConfigurationError,
  type MessagingClient,
  type RejectCallResponse,
  type RequestOptions,
  type ResolveIdentityParams,
  type ResolveIdentityResult,
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
      'Incoming caller Polymorfa ID cannot be empty.',
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

export async function resolveIdentity(
  client: MessagingClient,
  session: string,
  input: {
    readonly id?: string
    readonly phoneNumber?: string
    readonly username?: string
    readonly usernameKey?: string
  },
): Promise<SessionIdentityResult<ResolveIdentityResult>> {
  const response = await client.identities.resolve(
    session,
    identityParams(input),
  )
  return result(response.data.data, response.metadata)
}

export async function viewUserSecurityCode(
  client: MessagingClient,
  session: string,
  userId: string,
): Promise<SessionIdentityResult<UserSecurityCode>> {
  validateUserId(userId, 'User ID')
  const response = await client.users.getSecurityCode(session, userId)
  return result(response.data.data, response.metadata)
}

export function renderResolvedIdentity(
  identity: ResolveIdentityResult,
): string {
  const rows = [
    row('ID', identity.id),
    row('BSUID', identity.bsuid),
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

function identityParams(input: {
  readonly id?: string
  readonly phoneNumber?: string
  readonly username?: string
  readonly usernameKey?: string
}): ResolveIdentityParams {
  const identities = [input.phoneNumber, input.id, input.username].filter(
    (value) => value !== undefined,
  )
  if (identities.length !== 1) {
    throw new PolymorfaConfigurationError(
      'Provide exactly one of --phone-number, --id, or --username.',
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
    validateUserId(input.id, 'User ID')
    return {id: input.id}
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

function validateUserId(value: string, label: string): void {
  if (!/^[1-9]\d{0,18}$/.test(value)) {
    throw new PolymorfaConfigurationError(
      `${label} must be a decimal string.`,
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
