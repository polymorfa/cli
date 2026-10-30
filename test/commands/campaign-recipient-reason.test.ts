import {Parser} from '@oclif/core'
import {describe, expect, test} from 'vitest'
import CampaignRecipientsList from '../../src/commands/campaign/recipients/list.js'

const parseReason = (reason: string) =>
  Parser.parse(
    ['campaign_1', '--project-slug', 'project_1', '--reason', reason],
    {args: CampaignRecipientsList.args, flags: CampaignRecipientsList.flags},
  )

describe('campaign recipient reason admission', () => {
  test('accepts the existing frequency_cap reason', async () => {
    const result = await parseReason('frequency_cap')
    expect(result.flags.reason).toBe('frequency_cap')
  })
  test('rejects an unknown reason during flag parsing', async () => {
    await expect(parseReason('invented_reason')).rejects.toThrow(/--reason/)
  })
})
