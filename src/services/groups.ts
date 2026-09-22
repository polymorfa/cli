import {
  PolymorfaConfigurationError,
  type Group,
  type GroupMemberAddMode,
  type GroupParticipant,
  type MessagingClient,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
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

export type ParticipantAction = 'add' | 'remove' | 'promote' | 'demote'

const USER_ID = /^[1-9][0-9]{0,18}$/

/** Group participants are Polymorfa user IDs; resolve phones with `identity`. */
export function participantIds(values: readonly string[]): string[] {
  const ids = values.map((value) => value.trim())
  if (ids.length === 0) {
    throw new PolymorfaConfigurationError(
      'Pass at least one --participant.',
      'participant',
    )
  }
  for (const id of ids) {
    if (!USER_ID.test(id)) {
      throw new PolymorfaConfigurationError(
        `Participant ${id} is not a Polymorfa user ID. Resolve phone numbers with \`polymorfa identity resolve\` first.`,
        'participant',
      )
    }
  }
  return [...new Set(ids)]
}

export async function createGroup(
  client: MessagingClient,
  session: string,
  name: string,
  participants: readonly string[],
  options: RequestOptions = {},
): Promise<ResourceResult<Group>> {
  if (name.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Group --name cannot be empty.',
      'name',
    )
  }
  const response = await client.groups.create(
    session,
    {name, participants: participantIds(participants)},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function changeGroupParticipants(
  client: MessagingClient,
  session: string,
  group: string,
  action: ParticipantAction,
  participants: readonly string[],
  options: RequestOptions = {},
): Promise<ResourceResult<SuccessResponse>> {
  const body = {participants: participantIds(participants)}
  const response =
    action === 'add'
      ? await client.groups.addParticipants(session, group, body, options)
      : action === 'remove'
        ? await client.groups.removeParticipants(session, group, body, options)
        : action === 'promote'
          ? await client.groups.promoteParticipants(
              session,
              group,
              body,
              options,
            )
          : await client.groups.demoteParticipants(
              session,
              group,
              body,
              options,
            )
  return result(response.data, response.metadata)
}

export async function setGroupText(
  client: MessagingClient,
  session: string,
  group: string,
  field: 'subject' | 'description',
  value: string,
  options: RequestOptions = {},
): Promise<ResourceResult<SuccessResponse>> {
  if (field === 'subject' && value.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Group subject cannot be empty.',
      'subject',
    )
  }
  const response =
    field === 'subject'
      ? await client.groups.setSubject(session, group, {value}, options)
      : await client.groups.setDescription(session, group, {value}, options)
  return result(response.data, response.metadata)
}

export interface GroupSettingsChange {
  readonly infoEditing?: 'admins' | 'all' | undefined
  readonly joinApproval?: boolean | undefined
  readonly memberAdd?: 'admins' | 'all' | undefined
  readonly messaging?: 'admins' | 'all' | undefined
}

export type GroupSettingName =
  'info-editing' | 'join-approval' | 'member-add' | 'messaging'

export interface GroupSettingsResult {
  readonly applied: readonly GroupSettingName[]
}

/**
 * Apply each requested setting through its own SDK call, in a fixed order.
 * The API has no combined settings write, so a failure leaves earlier
 * settings applied; the thrown error lists them.
 */
export async function updateGroupSettings(
  client: MessagingClient,
  session: string,
  group: string,
  change: GroupSettingsChange,
): Promise<ResourceResult<GroupSettingsResult>> {
  const steps: [
    GroupSettingName,
    () => Promise<{metadata: ResponseMetadata}>,
  ][] = []
  if (change.infoEditing !== undefined) {
    const adminsOnly = change.infoEditing === 'admins'
    steps.push([
      'info-editing',
      () => client.groups.setInfoEditing(session, group, {adminsOnly}),
    ])
  }
  if (change.messaging !== undefined) {
    const adminsOnly = change.messaging === 'admins'
    steps.push([
      'messaging',
      () => client.groups.setMessaging(session, group, {adminsOnly}),
    ])
  }
  if (change.memberAdd !== undefined) {
    const mode: GroupMemberAddMode =
      change.memberAdd === 'admins' ? 'admin_add' : 'all_member_add'
    steps.push([
      'member-add',
      () => client.groups.setMemberAddMode(session, group, {mode}),
    ])
  }
  if (change.joinApproval !== undefined) {
    const required = change.joinApproval
    steps.push([
      'join-approval',
      () => client.groups.setJoinApproval(session, group, {required}),
    ])
  }
  if (steps.length === 0) {
    throw new PolymorfaConfigurationError(
      'Pass at least one of --info-editing, --messaging, --member-add, or --join-approval.',
      'settings',
    )
  }

  const applied: GroupSettingName[] = []
  let metadata: ResponseMetadata | undefined
  for (const [name, run] of steps) {
    try {
      metadata = (await run()).metadata
    } catch (error) {
      if (applied.length > 0 && error instanceof Error) {
        error.message = `${error.message} Settings already applied: ${applied.join(', ')}.`
      }
      throw error
    }
    applied.push(name)
  }
  return result({applied}, metadata as ResponseMetadata)
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
