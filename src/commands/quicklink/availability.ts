import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'

export default class QuickLinkAvailability extends BaseCommand {
  static override description =
    'Read a Number’s connections and whether an added connection is available.'
  static override flags = {
    session: Flags.string({
      description: 'Existing Number session name.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(QuickLinkAvailability)
    const {client, projectId} = await this.quickLinksClient(flags)
    const response = await client.quickLinks.availability({
      projectId,
      session: flags.session,
    })
    const data = response.data.data
    const connections = data.connections
      .map(
        ({kind, status, enabled}) =>
          `${kind}: ${status} (${enabled ? 'enabled' : 'disabled'})`,
      )
      .join(', ')
    this.writeValue(
      response,
      [
        data.allowed && data.addConnection
          ? `Available: ${data.addConnection}`
          : 'No added connection is available.',
        `Connections: ${connections || 'none'}`,
        ...(data.resumeQuickLinkId
          ? [`Resume QuickLink: ${data.resumeQuickLinkId}`]
          : []),
      ].join('\n'),
      flags,
    )
  }
}
