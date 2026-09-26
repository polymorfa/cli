import {Args, Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {
  exportCampaignRecipients,
  recipientFailureReason,
  recipientStatus,
  RECIPIENT_FAILURE_REASONS,
  RECIPIENT_STATUSES,
} from '../../../services/campaigns.js'

export default class CampaignRecipientsExport extends BaseCommand {
  static override args = {
    campaign: Args.string({description: 'Campaign ID.', required: true}),
  }

  static override description = `Export campaign recipient outcomes as CSV.

Unfiltered exports read cursor pages and write one header. Use --max-pages to stop early; the remaining cursor is printed on standard error. Resume with --cursor. Filtered exports contain up to 1,000 matches in one request and return an error for larger results. Clear filters to export all recipients, then filter the file locally. Each page reflects outcomes when fetched.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> campaign_1 --project-slug launch --output recipients.csv',
    '<%= config.bin %> <%= command.id %> campaign_1 --project-slug launch --status failed --reason send_failed',
  ]

  static override flags = {
    cursor: Flags.string({
      description: 'Continue from an earlier unfiltered export cursor.',
    }),
    force: Flags.boolean({description: 'Overwrite an existing --output file.'}),
    limit: Flags.integer({
      description: 'Rows per unfiltered API page. Filtered exports require 1000.',
      min: 1,
      max: 1000,
      default: 1000,
    }),
    'max-pages': Flags.integer({
      description: 'Stop after this many pages.',
      min: 1,
      max: 500,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Write CSV to this file instead of standard output.',
    }),
    'project-slug': Flags.string({
      description: 'Project slug in the Messaging API path.',
      required: true,
    }),
    reason: Flags.string({
      description: 'Filter by failure reason.',
      options: [...RECIPIENT_FAILURE_REASONS],
    }),
    status: Flags.string({
      description: 'Filter by delivery status.',
      options: [...RECIPIENT_STATUSES],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CampaignRecipientsExport)
    const cursor = flags.cursor?.trim()
    if (cursor !== undefined && (cursor.length === 0 || cursor.length > 1024))
      throw new PolymorfaConfigurationError(
        '--cursor must be 1 to 1024 characters.',
        'cursor',
      )
    const outputPath =
      flags.output && flags.output !== '-' ? resolve(flags.output) : undefined
    if (outputPath && !flags.force) {
      try {
        await stat(outputPath)
        throw new PolymorfaConfigurationError(
          'The output file already exists; pass --force to replace it.',
          'output',
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const result = await exportCampaignRecipients(
      await this.messagingClient(flags, {serverApiKeyOnly: 'Campaign'}),
      flags['project-slug'],
      args.campaign,
      {
        ...(cursor === undefined ? {} : {cursor}),
        limit: flags.limit,
        ...(flags.status === undefined
          ? {}
          : {status: recipientStatus(flags.status)!}),
        ...(flags.reason === undefined
          ? {}
          : {reason: recipientFailureReason(flags.reason)!}),
      },
      flags['max-pages'] ?? 500,
    )
    if (outputPath) {
      await writeFile(outputPath, result.csv, {
        flag: flags.force ? 'w' : 'wx',
      })
    } else {
      process.stdout.write(result.csv)
    }
    if (result.nextCursor !== null)
      process.stderr.write(`Continue with --cursor ${result.nextCursor}\n`)
  }
}
