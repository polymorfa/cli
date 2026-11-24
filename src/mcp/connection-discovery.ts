import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {PROJECT_UUID} from '../config/project-link.js'
import {resolveCommandEnvironment} from '../context/environment.js'
import {createPlatformClient} from '../sdk/client.js'
import {listManagedConnections} from '../services/platform-management.js'

export interface McpConnectionSummary {
  readonly connectionId: string
  readonly name: string
  readonly status: string
  readonly testMode: boolean
}

export interface McpConnectionList {
  readonly connections: readonly McpConnectionSummary[]
  readonly status: number
  readonly requestId?: string
}

/** Read one project's connection metadata without exposing phone or credentials. */
export async function listMcpConnections(
  projectId: string,
): Promise<McpConnectionList> {
  if (!PROJECT_UUID.test(projectId)) {
    throw new PolymorfaConfigurationError(
      'A project UUID is required.',
      'projectId',
    )
  }
  if (
    process.env.POLYMORFA_PROJECT_TOKEN?.trim() ||
    (process.env.POLYMORFA_API_KEY?.trim() &&
      process.env.POLYMORFA_CLIENT_TOKEN?.trim())
  ) {
    throw new PolymorfaConfigurationError(
      'Select only one team API key for MCP connection discovery.',
      'credential',
    )
  }
  const environment = await resolveCommandEnvironment({
    env: process.env,
    surface: 'platform',
  })
  const response = await listManagedConnections(
    createPlatformClient(environment),
    projectId,
  )
  return {
    connections: response.data.map(
      ({connectionId, name, status, testMode}) => ({
        connectionId,
        name,
        status,
        testMode,
      }),
    ),
    status: response.metadata.status,
    ...(response.metadata.requestId === undefined
      ? {}
      : {requestId: response.metadata.requestId}),
  }
}
