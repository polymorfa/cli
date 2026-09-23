import {
  type AddAudienceMembersResult,
  type AudienceImportResult,
  type AudienceMember,
  type AudienceImportMapping,
  type AudienceMembersEnvelope,
  type CampaignRecipientInput,
  type ClientInstance,
  type CreateAudienceRequest,
  type DeleteAudienceMemberResult,
  type ListAudienceMembersParams,
  PolymorfaValidationError,
  type RequestOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import {renderInvalidRows} from './campaigns.js'

export interface AudienceResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function createAudience(
  client: ClientInstance<'organization'>,
  body: CreateAudienceRequest,
  options: RequestOptions = {},
): Promise<AudienceResult<AudienceImportResult>> {
  const response = await client.audiences.create(body, options)
  return result(response.data.data, response.metadata)
}

export async function addAudienceMembers(
  client: ClientInstance<'organization'>,
  listId: string,
  members: readonly CampaignRecipientInput[],
  options: RequestOptions = {},
): Promise<AudienceResult<AddAudienceMembersResult>> {
  const response = await client.audiences.addMembers(listId, {members}, options)
  return result(response.data.data, response.metadata)
}

export async function listAudienceMembers(
  client: ClientInstance<'organization'>,
  listId: string,
  params: ListAudienceMembersParams,
): Promise<AudienceResult<AudienceMembersEnvelope>> {
  const response = await client.audiences.listMembers(listId, params)
  return result(response.data, response.metadata)
}

export async function removeAudienceMember(
  client: ClientInstance<'organization'>,
  listId: string,
  phone: string,
  options: RequestOptions = {},
): Promise<AudienceResult<DeleteAudienceMemberResult>> {
  const response = await client.audiences.deleteMember(listId, phone, options)
  return result(response.data.data, response.metadata)
}

/** Parse a `--mapping` JSON document for the API's file import. */
export function audienceMapping(input: unknown): AudienceImportMapping {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PolymorfaValidationError(
      'Mapping must be a JSON object naming the phone column.',
      {code: 'invalid_audience_mapping'},
    )
  }
  const record = input as Readonly<Record<string, unknown>>
  if (typeof record.phone !== 'string' || record.phone.trim() === '') {
    throw new PolymorfaValidationError(
      'Mapping must name the phone column as a non-empty string.',
      {code: 'invalid_audience_mapping'},
    )
  }
  return record as unknown as AudienceImportMapping
}

export function renderAudienceImport(audience: AudienceImportResult): string {
  return [
    `ID\t${audience.id}`,
    `Name\t${audience.name}`,
    `Source\t${audience.source}`,
    `Members\t${audience.recipientCount}`,
    `Duplicates skipped\t${audience.duplicateCount}`,
    `Invalid\t${audience.invalidCount}`,
    ...renderInvalidRows(audience.invalidRows),
  ].join('\n')
}

export function renderMemberAppend(result: AddAudienceMembersResult): string {
  return [
    `Added\t${result.added}`,
    `On audience\t${result.recipientCount}`,
    `Duplicates skipped\t${result.duplicateCount}`,
    `Invalid\t${result.invalidCount}`,
    ...renderInvalidRows(result.invalidRows),
  ].join('\n')
}

export function renderAudienceMembers(
  envelope: AudienceMembersEnvelope,
): string {
  if (envelope.data.length === 0) return 'No members found.'
  const rows = envelope.data.map((member: AudienceMember) =>
    [
      member.id,
      member.phone,
      Object.entries(member.variables)
        .map(([name, value]) => `${name}=${value}`)
        .join(' '),
    ].join('\t'),
  )
  if (envelope.page.hasMore && envelope.page.nextCursor !== null) {
    rows.push(
      `More members remain. Continue with --cursor ${envelope.page.nextCursor}.`,
    )
  }
  return rows.join('\n')
}

export function renderMemberRemoval(
  result: DeleteAudienceMemberResult,
): string {
  return result.removed
    ? `Removed ${result.phone} from audience ${result.listId}. ${result.recipientCount} members remain.`
    : `${result.phone} was not in audience ${result.listId}. ${result.recipientCount} members remain.`
}

function result<T>(data: T, metadata: ResponseMetadata): AudienceResult<T> {
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
