import {PolymorfaValidationError, type ApiResponse} from '@polymorfa/sdk'
import {terminalText} from '../developer/render.js'
import type {
  AudienceProfile,
  AudienceProfilesEnvelope,
  AudienceProfileImport,
  PutAudienceProfileRequest,
  AudienceProfileImportMapping,
} from '../sdk/audience-profiles.js'

export function profileResult<T>(response: ApiResponse<T>) {
  return {
    data: response.data,
    metadata: {
      status: response.metadata.status,
      attempts: response.metadata.attempts,
      ...(response.metadata.requestId === undefined
        ? {}
        : {requestId: response.metadata.requestId}),
      ...(response.metadata.apiVersion === undefined
        ? {}
        : {apiVersion: response.metadata.apiVersion}),
    },
  }
}
export function renderProfile(profile: AudienceProfile): string {
  return [
    ['Phone', profile.phone],
    ['Revision', profile.revision],
    ['Tags', profile.tags.join(', ')],
    ['Attributes', JSON.stringify(profile.attributes)],
  ]
    .map(([key, value]) => `${key}\t${terminalText(value!)}`)
    .join('\n')
}
export function renderProfilePage(page: AudienceProfilesEnvelope): string {
  const rows = page.data.map(
    (p) =>
      `${terminalText(p.phone)}\t${p.revision}\t${terminalText(p.tags.join(', '))}`,
  )
  if (rows.length === 0) rows.push('No profiles found.')
  if (page.page.hasMore && page.page.nextCursor !== null)
    rows.push(
      `Continue with --cursor ${terminalText(page.page.nextCursor)} and the same filters.`,
    )
  return rows.join('\n')
}
export function renderImport(job: AudienceProfileImport): string {
  return [
    ['ID', job.id],
    ['State', job.state],
    ['Valid rows', job.totalValid],
    ['Processed', job.processedValid],
    ['Created', job.createdCount],
    ['Updated', job.updatedCount],
    ['Invalid', job.invalidCount],
    ['Conflicts', job.conflictCount],
    ['Invalid samples', JSON.stringify(job.invalidSamples)],
    ['Conflict samples', JSON.stringify(job.conflictSamples)],
  ]
    .map(([key, value]) => `${key}\t${terminalText(value!)}`)
    .join('\n')
}
function record(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new PolymorfaValidationError('Input must be a JSON object.', {
      code: 'invalid_parameter',
    })
  return input as Record<string, unknown>
}
export function profileInput(input: unknown): PutAudienceProfileRequest {
  const body = record(input)
  if (
    !Array.isArray(body.tags) ||
    typeof body.attributes !== 'object' ||
    body.attributes === null ||
    Array.isArray(body.attributes)
  )
    throw new PolymorfaValidationError(
      'tags (array) and attributes (object) are required.',
      {code: 'invalid_parameter'},
    )
  return body as unknown as PutAudienceProfileRequest
}
export function importMapping(input: unknown): AudienceProfileImportMapping {
  const mapping = record(input)
  if (
    ['phone', 'tags', 'attributes'].some(
      (key) => typeof mapping[key] !== 'string' || mapping[key] === '',
    )
  )
    throw new PolymorfaValidationError(
      'Mapping must name phone, tags and attributes columns.',
      {code: 'invalid_parameter'},
    )
  return mapping as AudienceProfileImportMapping
}
