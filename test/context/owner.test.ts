import {describe, expect, test} from 'vitest'

import {resolveOwnerContext} from '../../src/context/owner.js'

describe('resolveOwnerContext', () => {
  test('requires explicit owner and exact project context', () => {
    expect(() =>
      resolveOwnerContext({principalType: 'organization_key'}),
    ).toThrow('owner')
    expect(() =>
      resolveOwnerContext({owner: 'project', principalType: 'project_token'}),
    ).toThrow('project')
    expect(
      resolveOwnerContext({
        owner: 'project',
        principalType: 'project_token',
        projectId: 'project_1',
      }),
    ).toEqual({
      owner: 'project',
      principalType: 'project_token',
      projectId: 'project_1',
    })
  })

  test('rejects project context and project tokens for organization ownership', () => {
    expect(() =>
      resolveOwnerContext({
        owner: 'organization',
        principalType: 'project_token',
      }),
    ).toThrow('project token')
    expect(() =>
      resolveOwnerContext({
        owner: 'organization',
        principalType: 'organization_key',
        projectId: 'project_1',
      }),
    ).toThrow('project override')
  })
})
