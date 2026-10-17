import {BaseCommand} from '../../../../base-command.js'
import {
  getFrequencyCap,
  renderFrequencyCap,
} from '../../../../services/campaign-frequency-cap.js'
export default class FrequencyCapGet extends BaseCommand {
  static override description =
    'Read team contact frequency caps and their revision.'

  async run(): Promise<void> {
    const {flags} = await this.parse(FrequencyCapGet)

    const result = await getFrequencyCap(await this.platformClient(flags))
    this.writeValue(result, renderFrequencyCap(result.data), flags)
  }
}
