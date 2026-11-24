import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {developerResponse} from '../../developer/output.js'
import {renderEventDetail} from '../../developer/render.js'

export default class EventView extends BaseCommand {
  static override args = {
    event: Args.string({description: 'Event ID.', required: true}),
  }

  static override description = 'View one retained event.'

  static override flags = {
    'include-payload': Flags.boolean({
      description: 'Include the retained payload when it is available.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EventView)
    const connection = await this.developerConnection(flags)
    const response = await connection.client.events.retrieve(
      args.event,
      {includePayload: flags['include-payload']},
      connection.requestOptions,
    )
    this.writeValue(
      developerResponse(response, connection.context),
      renderEventDetail(response.data, flags['include-payload']),
      flags,
    )
  }
}
