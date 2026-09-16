import {describe, expect, it, vi} from 'vitest'
import {createQuickLink} from '../../src/services/quicklinks.js'

describe('QuickLink creation', () => {
  it('rejects per-link presentation and project replacement before transport', async () => {
    const create = vi.fn()
    const client = {quickLinks: {create}}
    await expect(
      createQuickLink(client as never, {theme: 'light'}),
    ).rejects.toThrow('saved settings')
    await expect(
      createQuickLink(client as never, {projectId: 'other'}, 'selected'),
    ).rejects.toThrow('conflicts')
    expect(create).not.toHaveBeenCalled()
  })
  it('forwards nested configuration with the selected project', async () => {
    const create = vi.fn(() =>
      Promise.resolve({
        data: {
          data: {
            id: 'ql_test',
            url: 'https://example.test/connect/test',
            expiresAt: null,
          },
        },
        metadata: {status: 201},
      }),
    )
    const configuration = {
      connectionPreference: 'linked',
      historySync: {consent: 'ask'},
    }
    const result = await createQuickLink(
      {quickLinks: {create}} as never,
      {configuration},
      'project',
    )
    expect(create).toHaveBeenCalledWith({projectId: 'project', configuration})
    expect(result.data.expiresAt).toBeNull()
  })
})
