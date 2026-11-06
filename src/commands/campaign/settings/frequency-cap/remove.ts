import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../../base-command.js'
import {
  updateFrequencyCap,
  renderFrequencyCap,
} from '../../../../services/campaign-frequency-cap.js'
export default class FrequencyCapRemove extends BaseCommand {
  static override description =
    'Remove both team limits, including without beta access. Requires the last read revision.'
  static override flags = {
    revision: Flags.integer({
      required: true,
      min: 0,
      max: 2147483646,
      description:
        'Revision from get. On 409, read again and reconcile before retrying.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(FrequencyCapRemove)

    const result = await updateFrequencyCap(await this.platformClient(flags), {
      revision: flags.revision,
      maxPer24Hours: null,
      maxPer7Days: null,
    })
    this.writeValue(result, renderFrequencyCap(result.data), flags)
  }
}
