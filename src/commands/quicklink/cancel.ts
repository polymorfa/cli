import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {confirmDangerous} from '../../input/confirmation.js'

export default class QuickLinkCancel extends BaseCommand {
  static override args = {
    quicklink: Args.string({description: 'QuickLink ID.', required: true}),
  }

  static override description =
    'Cancel a QuickLink that has not connected and remove its pending session.'

  static override flags = {
    yes: Flags.boolean({description: 'Confirm QuickLink cancellation.'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(QuickLinkCancel)
    await confirmDangerous({
      prompt: `Cancel QuickLink ${args.quicklink}?`,
      yes: flags.yes,
    })
    const {client} = await this.quickLinksClient(flags)
    const response = await client.quickLinks.cancel(args.quicklink)
    this.writeValue(response, `Cancelled QuickLink ${args.quicklink}.`, flags)
  }
}
