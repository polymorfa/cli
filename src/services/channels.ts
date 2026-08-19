import {
  PolymorfaConfigurationError,
  type AsyncAcceptedData,
  type Channel,
  type ApiResponse,
  type ChannelLiveUpdates,
  type ChannelMessage,
  type ChannelMessageUpdatesParams,
  type ChannelMessagesParams,
  type CreateChannelRequest,
  type DeletedChannel,
  type FollowChannelResponse,
  type MessagingClient,
  type MuteChannelResponse,
  type ReactToChannelMessageResponse,
  type RequestOptions,
  type ResponseMetadata,
  type UnfollowChannelResponse,
  type UnmuteChannelResponse,
  type MarkChannelMessageViewedResponse,
} from '@polymorfa/sdk'

export interface ChannelResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listChannels(
  client: MessagingClient,
  session: string,
): Promise<ChannelResult<readonly Channel[]>> {
  const response = await client.channels.list(session)
  return result(response.data.data, response.metadata)
}

export async function viewChannel(
  client: MessagingClient,
  session: string,
  channel: string,
): Promise<ChannelResult<Channel>> {
  const response = await client.channels.retrieve(session, channel)
  return result(response.data.data, response.metadata)
}

export async function createChannel(
  client: MessagingClient,
  session: string,
  input: CreateChannelRequest,
  options: RequestOptions = {},
): Promise<ChannelResult<Channel | AsyncAcceptedData>> {
  if (input.name.length === 0) {
    throw new PolymorfaConfigurationError(
      'Channel name cannot be empty.',
      'name',
    )
  }

  const response = await client.channels.create(session, input, options)
  return result(response.data.data, response.metadata)
}

export async function deleteChannel(
  client: MessagingClient,
  session: string,
  channel: string,
  options: RequestOptions = {},
): Promise<ChannelResult<DeletedChannel | AsyncAcceptedData>> {
  const response = await client.channels.delete(session, channel, options)
  return result(response.data.data, response.metadata)
}

export async function listChannelMessages(
  client: MessagingClient,
  session: string,
  channel: string,
  params: ChannelMessagesParams,
): Promise<ChannelResult<readonly ChannelMessage[]>> {
  const response = await client.channels.listMessages(session, channel, params)
  return result(response.data.data, response.metadata)
}

export async function listChannelMessageUpdates(
  client: MessagingClient,
  session: string,
  channel: string,
  params: ChannelMessageUpdatesParams,
): Promise<ChannelResult<readonly ChannelMessage[]>> {
  const response = await client.channels.listMessageUpdates(
    session,
    channel,
    params,
  )
  return result(response.data.data, response.metadata)
}

export async function markChannelMessageViewed(
  client: MessagingClient,
  session: string,
  channel: string,
  serverId: string,
  options: RequestOptions = {},
): Promise<ChannelResult<MarkChannelMessageViewedResponse>> {
  const response = await client.channels.markMessageViewed(
    session,
    channel,
    parseServerId(serverId),
    options,
  )
  return result(response.data, response.metadata)
}

export async function reactToChannelMessage(
  client: MessagingClient,
  session: string,
  channel: string,
  serverId: string,
  reaction: string,
  options: RequestOptions = {},
): Promise<ChannelResult<ReactToChannelMessageResponse>> {
  if (Buffer.byteLength(reaction, 'utf8') > 32) {
    throw new PolymorfaConfigurationError(
      'Channel reaction cannot exceed 32 UTF-8 bytes.',
      'reaction',
    )
  }

  const response = await client.channels.reactToMessage(
    session,
    channel,
    parseServerId(serverId),
    {reaction},
    options,
  )
  return result(response.data, response.metadata)
}

export async function subscribeToChannelLiveUpdates(
  client: MessagingClient,
  session: string,
  channel: string,
  options: RequestOptions = {},
): Promise<ChannelResult<ChannelLiveUpdates | AsyncAcceptedData>> {
  const response = await client.channels.subscribeToLiveUpdates(
    session,
    channel,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function followChannel(
  client: MessagingClient,
  session: string,
  channel: string,
  options: RequestOptions = {},
): Promise<ChannelResult<FollowChannelResponse>> {
  return channelAction(client.channels.follow(session, channel, options))
}

export async function unfollowChannel(
  client: MessagingClient,
  session: string,
  channel: string,
  options: RequestOptions = {},
): Promise<ChannelResult<UnfollowChannelResponse>> {
  return channelAction(client.channels.unfollow(session, channel, options))
}

export async function muteChannel(
  client: MessagingClient,
  session: string,
  channel: string,
  options: RequestOptions = {},
): Promise<ChannelResult<MuteChannelResponse>> {
  return channelAction(client.channels.mute(session, channel, options))
}

export async function unmuteChannel(
  client: MessagingClient,
  session: string,
  channel: string,
  options: RequestOptions = {},
): Promise<ChannelResult<UnmuteChannelResponse>> {
  return channelAction(client.channels.unmute(session, channel, options))
}

export function renderChannels(channels: readonly Channel[]): string {
  if (channels.length === 0) return 'No channels found.'
  return channels
    .map((channel) =>
      [channel.lid ?? 'unknown', channel.name ?? 'Unnamed channel']
        .concat(
          channel.followers === undefined
            ? []
            : [`${channel.followers} followers`],
        )
        .join('\t'),
    )
    .join('\n')
}

export function renderChannel(channel: Channel): string {
  const rows = [
    row('Name', channel.name),
    row('ID', channel.lid),
    row('Description', channel.description),
    row('Picture', channel.profileUrl),
    numberRow('Followers', channel.followers),
    booleanRow('Muted', channel.muted),
    booleanRow('Preview', channel.preview),
  ].filter((value): value is string => value !== undefined)
  return rows.length === 0
    ? JSON.stringify(channel, undefined, 2)
    : rows.join('\n')
}

export function renderChannelMessages(
  messages: readonly ChannelMessage[],
): string {
  if (messages.length === 0) return 'No channel messages found.'
  return messages
    .map((message) =>
      [
        String(message.serverId),
        message.timestamp,
        message.type,
        `${message.views} views`,
        message.text,
      ]
        .filter((value): value is string => value !== undefined)
        .join('\t'),
    )
    .join('\n')
}

function parseServerId(serverId: string): number {
  if (!/^[1-9]\d*$/.test(serverId)) {
    throw new PolymorfaConfigurationError(
      'Message server ID must be a positive integer.',
      'serverId',
    )
  }

  const parsed = Number(serverId)
  if (!Number.isSafeInteger(parsed)) {
    throw new PolymorfaConfigurationError(
      'Message server ID must be a positive safe integer.',
      'serverId',
    )
  }

  return parsed
}

async function channelAction<T>(
  responsePromise: Promise<ApiResponse<T>>,
): Promise<ChannelResult<T>> {
  const response = await responsePromise
  return result(response.data, response.metadata)
}

function booleanRow(label: string, value: boolean | undefined) {
  return value === undefined ? undefined : `${label}\t${value ? 'yes' : 'no'}`
}

function numberRow(label: string, value: number | undefined) {
  return value === undefined ? undefined : `${label}\t${value}`
}

function row(label: string, value: string | undefined) {
  return value === undefined ? undefined : `${label}\t${value}`
}

function result<T>(data: T, metadata: ResponseMetadata): ChannelResult<T> {
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
