import {
  type ChatPresenceData,
  type MessagingClient,
  type PresenceData,
  type PresenceState,
  type PresenceSubscriptionData,
  type RequestOptions,
  type ResponseMetadata,
  type SetPresenceResponse,
  type AsyncAcceptedData,
} from '@polymorfa/sdk'

export interface PresenceResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function viewPresence(
  client: MessagingClient,
  session: string,
): Promise<PresenceResult<PresenceData>> {
  const response = await client.presence.get(session)
  return result(response.data.data, response.metadata)
}

export async function setPresence(
  client: MessagingClient,
  session: string,
  presence: PresenceState,
  options: RequestOptions = {},
): Promise<PresenceResult<SetPresenceResponse>> {
  const response = await client.presence.set(session, {presence}, options)
  return result(response.data, response.metadata)
}

export async function viewChatPresence(
  client: MessagingClient,
  session: string,
  chat: string,
): Promise<PresenceResult<ChatPresenceData>> {
  const response = await client.presence.getForChat(session, chat)
  return result(response.data.data, response.metadata)
}

export async function subscribeToChatPresence(
  client: MessagingClient,
  session: string,
  chat: string,
  options: RequestOptions = {},
): Promise<PresenceResult<PresenceSubscriptionData | AsyncAcceptedData>> {
  const response = await client.presence.subscribe(session, chat, options)
  return result(response.data.data, response.metadata)
}

export function renderPresence(data: PresenceData): string {
  return [
    row('Desired', data.desired),
    row('Desired at', data.desiredAt),
    row('Last sent', data.lastSent),
    row('Last sent at', data.lastSentAt),
    `Authoritative\t${data.authoritative ? 'yes' : 'no'}`,
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderChatPresence(data: ChatPresenceData): string {
  return [
    `Presence observation\t${data.status}`,
    `Presence policy\t${data.policy}`,
    row('Unknown reason', data.unknownReason),
    booleanRow('Available', data.available),
    row('Last seen', data.lastSeen),
    row('Observed at', data.observedAt),
    `Stale\t${data.stale ? 'yes' : 'no'}`,
    row('Subscription expires', data.subscriptionExpiresAt),
    `Typing observation\t${data.typingStatus}`,
    `Typing policy\t${data.typingPolicy}`,
    row('Typing unknown reason', data.typingUnknownReason),
    row('Chat state', data.chatState?.state),
    row('Chat-state sender', data.chatState?.sender),
    row('Chat-state media', data.chatState?.media),
    row('Chat-state observed at', data.chatState?.observedAt),
    booleanRow('Chat-state stale', data.chatState?.stale),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

function booleanRow(label: string, value: boolean | undefined) {
  return value === undefined ? undefined : `${label}\t${value ? 'yes' : 'no'}`
}

function row(label: string, value: string | undefined) {
  return value === undefined ? undefined : `${label}\t${value}`
}

function result<T>(data: T, metadata: ResponseMetadata): PresenceResult<T> {
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
