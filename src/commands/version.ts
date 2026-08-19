import {Command} from '@oclif/core'
import {SDK_VERSION} from '@polymorfa/sdk'

export default class Version extends Command {
  static override description = 'Print the Polymorfa CLI and SDK versions.'

  async run(): Promise<void> {
    await this.parse(Version)
    this.log(`polymorfa/${this.config.version} sdk/${SDK_VERSION}`)
  }
}
