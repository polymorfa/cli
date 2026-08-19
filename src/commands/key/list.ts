import {BaseCommand} from '../../base-command.js'
import {listApiKeys, renderApiKeys} from '../../services/platform-management.js'

export default class KeyList extends BaseCommand {
  static override description =
    'List organization API-key metadata (never raw key material).'

  async run(): Promise<void> {
    const {flags} = await this.parse(KeyList)
    const result = await listApiKeys(await this.platformClient(flags))
    this.writeValue(result, renderApiKeys(result.data), flags)
  }
}
