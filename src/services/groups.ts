import type {
  Group,
  GroupParticipant,
  MessagingClient,
  ResponseMetadata,
} from '@polymorfa/sdk'

export interface ResourceResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export interface GroupInviteLink {
  readonly code: string
  readonly url: string
}

export async function listGroups(
  client: MessagingClient,
  session: string,
): Promise<ResourceResult<readonly Group[]>> {
  const response = await client.groups.list(session)
  return result(response.data.data, response.metadata)
}

export async function viewGroup(
  client: MessagingClient,
  session: string,
  group: string,
): Promise<ResourceResult<Group>> {
  const response = await client.groups.retrieve(session, group)
  return result(response.data.data, response.metadata)
}

export async function listGroupParticipants(
  client: MessagingClient,
  session: string,
  group: string,
): Promise<ResourceResult<readonly GroupParticipant[]>> {
  const response = await client.groups.listParticipants(session, group)
  return result(response.data.data, response.metadata)
}

export async function getGroupInviteLink(
  client: MessagingClient,
  session: string,
  group: string,
): Promise<ResourceResult<GroupInviteLink>> {
  const response = await client.groups.getInviteCode(session, group)
  const code = response.data.data.code
  return result(
    {code, url: `https://chat.whatsapp.com/${code}`},
    response.metadata,
  )
}

function result<T>(data: T, metadata: ResponseMetadata): ResourceResult<T> {
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
