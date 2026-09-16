import {
  Client,
  type ApiResponse,
  type ClientBase,
  type ClientOwner,
  type CursorPage,
  type RequestOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import type {GlobalFlags} from '../base-command.js'
import {resolveDeveloperEnvironment} from '../context/environment.js'
import type {OutputContext} from '../output/contracts.js'

export type MetadataLike = ResponseMetadata
export type ApiResponseLike<T> = ApiResponse<T>
export type CursorPageLike<T> = CursorPage<T>

export interface DeveloperSession {
  readonly baseUrl: string
  readonly client: ClientBase<ClientOwner>
  readonly context: OutputContext
  readonly requestOptions: RequestOptions
}

export async function createDeveloperSession(
  flags: GlobalFlags,
  registerSecret?: (secret: string) => void,
): Promise<DeveloperSession> {
  const environment = await resolveDeveloperEnvironment({
    env: process.env,
    ...(flags['api-version'] === undefined
      ? {}
      : {apiVersion: flags['api-version']}),
    ...(flags.owner === undefined ? {} : {owner: flags.owner}),
    ...(flags.profile === undefined ? {} : {profile: flags.profile}),
    ...(flags.project === undefined ? {} : {project: flags.project}),
    ...(flags.timeout === undefined ? {} : {timeoutMs: flags.timeout}),
  })
  registerSecret?.(environment.credential)
  const root: ClientBase<ClientOwner> =
    environment.context.principalType === 'project_token'
      ? new Client({
          baseUrl: environment.baseUrl,
          credential: {
            type: 'projectToken',
            value: environment.credential,
          },
          projectId: requiredProject(environment.context.projectId),
          ...(environment.apiVersion === undefined
            ? {}
            : {apiVersion: environment.apiVersion}),
          ...(environment.timeoutMs === undefined
            ? {}
            : {timeoutMs: environment.timeoutMs}),
        })
      : new Client({
          baseUrl: environment.baseUrl,
          credential: {
            type: 'organizationApiKey',
            value: environment.credential,
          },
          ...(environment.apiVersion === undefined
            ? {}
            : {apiVersion: environment.apiVersion}),
          ...(environment.timeoutMs === undefined
            ? {}
            : {timeoutMs: environment.timeoutMs}),
        })
  const client =
    environment.context.owner === 'project' && root.owner === 'organization'
      ? root.project(requiredProject(environment.context.projectId))
      : root
  return {
    baseUrl: environment.baseUrl,
    client,
    context: environment.context,
    requestOptions: {},
  }
}

function requiredProject(projectId: string | null | undefined): string {
  if (projectId) return projectId
  throw new Error('Project-owned commands require a project ID.')
}
