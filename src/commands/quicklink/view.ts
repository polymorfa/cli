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
    const sync = quickLink.onboarding?.sync
    const summary = `${quickLink.id}\t${quickLink.status}\t${quickLink.session}`
    const progress =
      sync === undefined
        ? ''
        : `\nContacts request: ${sync.contacts.request}; receipt recorded: ${sync.contacts.receiptRecorded}\nHistory request: ${sync.history.request}; receipt recorded: ${sync.history.receiptRecorded}; delivery: ${sync.history.delivery}`
    this.writeValue(response, summary + progress, flags)
  }
}
