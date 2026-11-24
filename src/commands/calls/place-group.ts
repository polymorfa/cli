import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {placeCall, renderPlacedCall} from '../../services/calls.js'
import CallsPlace from './place.js'

export default class CallsPlaceGroup extends BaseCommand {
  static override description =
    'Place one WhatsApp group call by public group ID or to 2 to 31 distinct recipients from a Linked Device Connection. Each recipient must pass the Connection’s calling restrictions and your team’s destination policy. Cloud API connections refuse this operation.'
  static override examples = [
    '<%= config.bin %> calls place-group --to +15550100 --to +15550101 --connection support',
    '<%= config.bin %> calls place-group --group-id 9007199254740996 --connection support',
  ]
  static override flags = {
    ...CallsPlace.flags,
    'group-id': Flags.string({
      description:
        'Public group ID. Calls its 2 to 31 remote members after live consent checks.',
      exclusive: ['to'],
    }),
    to: Flags.string({
      description:
        'E.164 phone number or public user ID. Repeat for each recipient.',
      multiple: true,
      exclusive: ['group-id'],
    }),
  }
  static override summary = 'Place a WhatsApp group call.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsPlaceGroup)
    const environment = await this.messagingEnvironment(flags)
    const result = await placeCall(
      createMessagingClient(environment),
      environment.credential,
      {
        to: flags.to,
        groupId: flags['group-id'],
        connection: flags.connection,
        video: flags.video,
        exclusive: flags.exclusive,
        participant: flags.participant,
      },
    )
    this.writeValue(result, renderPlacedCall(result.data), flags)
  }
}
