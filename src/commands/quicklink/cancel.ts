import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {confirmDangerous} from '../../input/confirmation.js'

export default class QuickLinkCancel extends BaseCommand {
  static override args = {
    quicklink: Args.string({description: 'QuickLink ID.', required: true}),
  }

  static override description =
    'Cancel pending QuickLink setup. Supplementary links preserve the existing Number.'

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
    const message =
      response.metadata.status === 202
        ? `QuickLink cancellation requested for ${args.quicklink}. The link is invalidated; cleanup may continue.`
        : `Cancelled QuickLink ${args.quicklink}.`
    this.writeValue(response, message, flags)
  }
}
