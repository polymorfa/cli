import {Flags} from '@oclif/core'
import {PolymorfaValidationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../../../base-command.js'
import {
  updateFrequencyCap,
  renderFrequencyCap,
} from '../../../../services/campaign-frequency-cap.js'
export default class FrequencyCapSet extends BaseCommand {
  static override description =
    'Replace team limits (beta). Omitted windows become unlimited. Stale revisions return 409; no automatic retry.'
  static override flags = {
    revision: Flags.integer({
      required: true,
      min: 0,
      max: 2147483646,
      description:
        'Revision from get. On 409, read again and reconcile before retrying.',
    }),
    'max-per-24-hours': Flags.integer({
      min: 1,
      max: 50,
      description: 'Rolling 24-hour limit; omitted means no limit.',
    }),
    'max-per-7-days': Flags.integer({
      min: 1,
      max: 200,
      description: 'Rolling 7-day limit; omitted means no limit.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FrequencyCapSet)
    if (
      flags['max-per-24-hours'] === undefined &&
      flags['max-per-7-days'] === undefined
    )
      throw new PolymorfaValidationError(
        'Set at least one window, or use remove.',
        {code: 'invalid_frequency_cap'},
      )
    if (
      flags['max-per-24-hours'] !== undefined &&
      flags['max-per-7-days'] !== undefined &&
      flags['max-per-24-hours'] > flags['max-per-7-days']
    )
      throw new PolymorfaValidationError(
        'The 24-hour limit cannot exceed the 7-day limit.',
        {code: 'invalid_frequency_cap'},
      )
    const result = await updateFrequencyCap(await this.platformClient(flags), {
      revision: flags.revision,
      maxPer24Hours: flags['max-per-24-hours'] ?? null,
      maxPer7Days: flags['max-per-7-days'] ?? null,
    })
    this.writeValue(result, renderFrequencyCap(result.data), flags)
  }
}
