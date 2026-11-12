import {describe, expect, test} from 'vitest'

import {resolveOwnerContext} from '../../src/context/owner.js'

describe('resolveOwnerContext', () => {
  test('requires explicit owner and exact project context', () => {
    expect(() => resolveOwnerContext({principalType: 'team_key'})).toThrow(
      'owner',
    )
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

  test('rejects project context and project tokens for team ownership', () => {
    expect(() =>
      resolveOwnerContext({
        owner: 'team',
        principalType: 'project_token',
      }),
    ).toThrow('project token')
    expect(() =>
      resolveOwnerContext({
        owner: 'team',
        principalType: 'team_key',
        projectId: 'project_1',
      }),
    ).toThrow('project override')
  })
})
