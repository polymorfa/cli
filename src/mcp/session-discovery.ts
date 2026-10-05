import {PolymorfaConfigurationError} from '@polymorfa/sdk'

import {PROJECT_UUID} from '../config/project-link.js'
import {resolveCommandEnvironment} from '../context/environment.js'
import {createPlatformClient} from '../sdk/client.js'
import {listManagedSessions} from '../services/platform-management.js'

export interface McpSessionSummary {
  readonly sessionId: string
  readonly name: string
  readonly status: string
  readonly testMode: boolean
}

export interface McpSessionList {
  readonly sessions: readonly McpSessionSummary[]
  readonly status: number
  readonly requestId?: string
}

/** Read one project's session metadata without exposing phone or credentials. */
export async function listMcpSessions(
  projectId: string,
): Promise<McpSessionList> {
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
      'Select only one organization API key for MCP session discovery.',
      'credential',
    )
  }
  const environment = await resolveCommandEnvironment({
    env: process.env,
    surface: 'platform',
  })
  const response = await listManagedSessions(
    createPlatformClient(environment),
    projectId,
  )
  return {
    sessions: response.data.map(({sessionId, name, status, testMode}) => ({
      sessionId,
      name,
      status,
      testMode,
    })),
    status: response.metadata.status,
    ...(response.metadata.requestId === undefined
      ? {}
      : {requestId: response.metadata.requestId}),
  }
}
