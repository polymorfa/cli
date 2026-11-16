import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'

export default class QuickLinkAvailability extends BaseCommand {
  static override description =
    'Read a Connection’s methods and whether another method is available.'
  static override flags = {
    connection: Flags.string({
      description: 'Existing Connection name.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(QuickLinkAvailability)
    const {client, projectId} = await this.quickLinksClient(flags)
    const response = await client.quickLinks.availability({
      projectId,
      connection: flags.connection,
    })
    const data = response.data.data
    const methods = data.methods
      .map(
        ({kind, status, enabled}) =>
          `${kind}: ${status} (${enabled ? 'enabled' : 'disabled'})`,
      )
      .join(', ')
    this.writeValue(
      response,
      [
        data.allowed && data.addMethod
          ? `Available: ${data.addMethod}`
          : 'No added method is available.',
        `Methods: ${methods || 'none'}`,
        ...(data.resumeQuickLinkId
          ? [`Resume QuickLink: ${data.resumeQuickLinkId}`]
          : []),
      ].join('\n'),
      flags,
    )
  }
}
