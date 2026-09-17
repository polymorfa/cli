import {BaseCommand} from '../../base-command.js'
import {paginationFlags} from '../../developer/flags.js'
import {developerRead} from '../../developer/output.js'
import {listResources, paginationInput} from '../../developer/support.js'

export default class WebhookList extends BaseCommand {
  static override description = 'List webhooks for an explicit resource owner.'

  static override flags = paginationFlags

  async run(): Promise<void> {
    const {flags} = await this.parse(WebhookList)
    const session = await this.developerSession(flags)
    const result = await listResources(paginationInput(flags), (page) =>
      session.client.webhooks.list(page, session.requestOptions),
    )
    const output = developerRead(
      result.items,
      result.metadata,
      session.context,
      result.page,
    )
    this.writeValue(output, `${result.items.length} webhook(s).`, flags)
  }
}
