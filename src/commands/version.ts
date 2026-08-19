import {SDK_VERSION} from '@polymorfa/sdk'

import {BaseCommand} from '../base-command.js'

export default class Version extends BaseCommand {
  static override description = 'Print the Polymorfa CLI and SDK versions.'

  async run(): Promise<void> {
    const {flags} = await this.parse(Version)
    const versions = {cli: this.config.version, sdk: SDK_VERSION}

    this.writeValue(
      versions,
      `polymorfa/${versions.cli} sdk/${versions.sdk}`,
      flags,
    )
  }
}
