import {Client} from '@polymorfa/sdk'
import {describe, expect, test, vi} from 'vitest'

import {createDeveloperConnection} from '../../src/developer/client.js'
import {withEnvironment} from '../helpers/http-server.js'

describe('createDeveloperConnection', () => {
  test('ignores a broken project link for organization-owned resources', async () => {
    const loadLinkedProject = vi.fn(() =>
      Promise.reject(new Error('Broken project link')),
    )
    const connection = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () =>
        createDeveloperConnection(
          {owner: 'organization'},
          undefined,
          loadLinkedProject,
        ),
    )

    expect(connection.context.owner).toBe('organization')
    expect(loadLinkedProject).not.toHaveBeenCalled()
  })

  test('creates an immutable project view from an organization key', async () => {
    const connection = await withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () =>
        createDeveloperConnection({
          owner: 'project',
          project: PROJECT,
        }),
    )

    expect(connection.client).toBeInstanceOf(Client)
    expect(connection.client.owner).toBe('project')
    expect(connection.client.projectId).toBe(PROJECT)
    expect(connection.context).toMatchObject({
      owner: 'project',
      principalType: 'organization_key',
      projectId: PROJECT,
    })
  })

  test('constructs a project-root client for an exact project token', async () => {
    const connection = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
      },
      () =>
        createDeveloperConnection({
          owner: 'project',
          project: PROJECT,
        }),
    )

    expect(connection.client).toBeInstanceOf(Client)
    expect(connection.client.owner).toBe('project')
    expect(connection.client.projectId).toBe(PROJECT)
    expect(connection.context.principalType).toBe('project_token')
  })
})

const PROJECT = '11111111-1111-4111-8111-111111111111'
