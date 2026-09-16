import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'

export default class QuickLinkView extends BaseCommand {
  static override args = {
    quicklink: Args.string({description: 'QuickLink ID.', required: true}),
  }

  static override description = 'View the status of one hosted QuickLink.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(QuickLinkView)
    const {client} = await this.quickLinksClient(flags)
    const response = await client.quickLinks.retrieve(args.quicklink)
    const quickLink = response.data.data
    this.writeValue(
      response,
      `${quickLink.id}\t${quickLink.status}\t${quickLink.session}`,
      flags,
    )
  }
}
