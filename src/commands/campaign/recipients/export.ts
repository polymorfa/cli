import {Args, Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {open, stat} from 'node:fs/promises'
import {resolve} from 'node:path'

import {BaseCommand} from '../../../base-command.js'
import {
  CampaignRecipientExportInterrupted,
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

The command reads cursor pages with the same filters and writes one header. Use --max-pages to stop early; the remaining cursor is printed on standard error. Resume with --cursor and the same filters. This read reflects each recipient when its page was fetched.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> campaign_1 --project-slug launch --output recipients.csv',
    '<%= config.bin %> <%= command.id %> campaign_1 --project-slug launch --status failed --reason send_failed --max-pages 1',
  ]

  static override flags = {
    cursor: Flags.string({
      description: 'Continue from an earlier export cursor.',
    }),
    force: Flags.boolean({description: 'Overwrite an existing --output file.'}),
    limit: Flags.integer({
      description: 'Rows per API page.',
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
    // The export is CSV only. Refuse modes it cannot honour before reading
    // any recipient, so --quiet never prints recipient data.
    const mode = this.outputMode(flags)
    if (mode === 'json')
      throw new PolymorfaConfigurationError(
        'Recipient export writes CSV; --json is not supported. Use campaign recipients list --json for JSON.',
        'json',
      )
    if (mode === 'quiet' && outputPath === undefined)
      throw new PolymorfaConfigurationError(
        '--quiet would discard the CSV; pass --output to write it to a file.',
        'quiet',
      )
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
    const file = outputPath
      ? await open(outputPath, flags.force ? 'w' : 'wx')
      : undefined
    const write = file
      ? async (chunk: string) => {
          await file.write(chunk)
        }
      : async (chunk: string) => {
          // Wait for the pipe to drain so a slow reader bounds memory.
          if (!process.stdout.write(chunk))
            await new Promise<void>((done) =>
              process.stdout.once('drain', () => done()),
            )
        }
    let result
    try {
      result = await exportCampaignRecipients(
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
        write,
        flags['max-pages'] ?? 500,
      )
    } catch (error) {
      if (error instanceof CampaignRecipientExportInterrupted) {
        // The pages already written stay; resume after them.
        process.stderr.write(
          `Wrote ${error.pages} page(s) before the export stopped. Continue with --cursor ${error.nextCursor}\n`,
        )
        throw error.cause
      }
      throw error
    } finally {
      await file?.close()
    }
    if (result.nextCursor !== null)
      process.stderr.write(`Continue with --cursor ${result.nextCursor}\n`)
  }
}
