import type {OutputRequest, ResourceOwner} from './contracts.js'

interface MetadataLike {
  readonly attempts?: number
  readonly apiVersion?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly requestId?: string
  readonly status: number
}

export function outputRequest(metadata: MetadataLike): OutputRequest {
  return {
    apiVersion: metadata.apiVersion ?? null,
    id: metadata.requestId ?? null,
    status: metadata.status,
  }
}

export function operationStatusUrl(
  baseUrl: string,
  owner: ResourceOwner,
  projectId: string | undefined,
  operationId: string,
): string {
  const root = new URL(baseUrl)
  const prefix =
    owner === 'project'
      ? `/v1/projects/${encodeURIComponent(requiredProject(projectId))}`
      : '/v1'
  root.pathname = `${prefix}/operations/${encodeURIComponent(operationId)}`
  root.username = ''
  root.password = ''
  root.search = ''
  root.hash = ''
  return root.toString().replace(/\/$/, '')
}

function requiredProject(projectId: string | undefined): string {
  if (projectId) return projectId
  throw new Error('Project-owned operation URLs require a project ID.')
}
