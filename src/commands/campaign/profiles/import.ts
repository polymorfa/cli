import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {AudienceProfilesResource} from '../../../sdk/audience-profiles.js'
import {
  profileResult,
  renderImport,
} from '../../../services/audience-profiles.js'
import {readJsonInput, readTextInput} from '../../../api/request.js'
import {importMapping} from '../../../services/audience-profiles.js'
export default class ProfilesImport extends BaseCommand {
  static override description =
    'Queue a profile CSV import (at most 10 MiB and 10,000 data rows). Requires campaigns:manage and beta enrollment. Reuse the replay key only with identical CSV, mapping and credential; poll imports get for progress.'
  static override flags = {
    csv: Flags.string({
      required: true,
      description: 'UTF-8 CSV file or stdin (-).',
    }),
    'replay-key': Flags.string({
      required: true,
      description:
        'Stable import identity, 1-128 letters, digits, dots, underscores, colons or hyphens.',
    }),
    mapping: Flags.string({
      description: 'JSON file mapping profile fields to CSV header names.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(ProfilesImport)
    if (flags.csv === '-' && flags.mapping === '-')
      throw new Error('CSV and mapping cannot both read stdin.')
    const csv = await readTextInput(flags.csv)
    const mapping =
      flags.mapping === undefined
        ? undefined
        : importMapping(await readJsonInput(flags.mapping))
    const resource = new AudienceProfilesResource(
      (await this.platformClient(flags)).raw,
    )

    const response = await resource.createImport({
      csv,
      replayKey: flags['replay-key'],
      ...(mapping === undefined ? {} : {mapping}),
    })
    this.writeValue(
      profileResult(response),
      renderImport(response.data.data),
      flags,
    )
  }
}
