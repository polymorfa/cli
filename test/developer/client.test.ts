import {Client} from '@polymorfa/sdk'
import {describe, expect, test, vi} from 'vitest'

import {createDeveloperSession} from '../../src/developer/client.js'
import {withEnvironment} from '../helpers/http-server.js'

describe('createDeveloperSession', () => {
  test('ignores a broken project link for organization-owned resources', async () => {
    const loadLinkedProject = vi.fn(() =>
      Promise.reject(new Error('Broken project link')),
    )
    const session = await withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () =>
        createDeveloperSession(
          {owner: 'organization'},
          undefined,
          loadLinkedProject,
        ),
    )

    expect(session.context.owner).toBe('organization')
    expect(loadLinkedProject).not.toHaveBeenCalled()
  })

  test('creates an immutable project view from an organization key', async () => {
    const session = await withEnvironment(
      {
        POLYMORFA_API_KEY:
          'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN: undefined,
      },
      () =>
        createDeveloperSession({
          owner: 'project',
          project: PROJECT,
        }),
    )

    expect(session.client).toBeInstanceOf(Client)
    expect(session.client.owner).toBe('project')
    expect(session.client.projectId).toBe(PROJECT)
    expect(session.context).toMatchObject({
      owner: 'project',
      principalType: 'organization_key',
      projectId: PROJECT,
    })
  })

  test('constructs a project-root client for an exact project token', async () => {
    const session = await withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_CLIENT_TOKEN: undefined,
        POLYMORFA_PROJECT_TOKEN:
          'pmfa_pt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      () =>
        createDeveloperSession({
          owner: 'project',
          project: PROJECT,
        }),
    )

    expect(session.client).toBeInstanceOf(Client)
    expect(session.client.owner).toBe('project')
    expect(session.client.projectId).toBe(PROJECT)
    expect(session.context.principalType).toBe('project_token')
  })
})

const PROJECT = '11111111-1111-4111-8111-111111111111'
