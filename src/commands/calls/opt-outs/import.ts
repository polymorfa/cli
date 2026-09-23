import {Args, Flags} from '@oclif/core'

import {readTextInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'
import {CliConditionError} from '../../../errors/conditions.js'
import {presentError} from '../../../errors/present.js'
import {
  IMPORT_BATCH_SIZE,
  importCallOptOuts,
  importFormat,
  parseImportEntries,
  renderImportSummary,
} from '../../../services/call-consent.js'

export default class CallsOptOutsImport extends BaseCommand {
  static override args = {
    file: Args.string({
      description: 'CSV or JSON file, or - for standard input with --format.',
      required: true,
    }),
  }

  static override description = `Add many people to the team’s do-not-call list from a file of up to 10 MiB. CSV needs a header row naming phoneNumber, bsuid and optionally note; each row names a phone number (E.164) or a BSUID. JSON is an array of {"phoneNumber" | "bsuid", "note"} objects, or an object with that array as "entries". The CLI sends ${IMPORT_BATCH_SIZE.toLocaleString('en-US')} entries per request and reports the entries added, already listed and rejected, with each rejected entry's zero-based position (and CSV line). Running an import again is safe: entries already on the list are counted as already listed. Exit codes: 0 when every entry is listed; 12 when some entries were rejected, or when a later request failed after earlier batches were stored (run the import again); the request's own exit code when nothing was stored. Requires an organization API key.`

  static override examples = [
    '<%= config.bin %> calls opt-outs import do-not-call.csv',
    '<%= config.bin %> calls opt-outs import entries.json --json',
    'cat do-not-call.csv | <%= config.bin %> calls opt-outs import - --format csv',
  ]

  static override flags = {
    format: Flags.string({
      description:
        'File format; required for standard input. Defaults to the file extension.',
      options: ['csv', 'json'],
    }),
  }

  static override summary = 'Import entries into the do-not-call list.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CallsOptOutsImport)
    const format = importFormat(args.file, flags.format)
    const entries = parseImportEntries(await readTextInput(args.file), format)
    const client = await this.platformClient(flags)
    const progress = await importCallOptOuts(client, entries)
    const {summary} = progress
    if (progress.error !== undefined && summary.batches === 0) {
      throw progress.error
    }
    this.writeValue(
      {
        data: summary,
        ...(progress.metadata === undefined
          ? {}
          : {metadata: progress.metadata}),
      },
      renderImportSummary(summary),
      flags,
    )
    if (progress.error !== undefined) {
      const reason = presentError(progress.error).message
      throw new CliConditionError(
        'partial_success',
        `Stored ${summary.batches} of ${progress.totalBatches} batches, then a request failed: ${reason} Run the import again; entries already stored are counted as already listed.`,
        {cause: progress.error},
      )
    }
    if (summary.rejected.length > 0) {
      throw new CliConditionError(
        'partial_success',
        `${summary.rejected.length} of ${summary.entries} entries were rejected and not added.`,
      )
    }
  }
}
