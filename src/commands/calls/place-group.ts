import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {createMessagingClient} from '../../sdk/client.js'
import {placeCall, renderPlacedCall} from '../../services/calls.js'
import CallsPlace from './place.js'

export default class CallsPlaceGroup extends BaseCommand {
  static override description =
    'Place one ad-hoc WhatsApp group call to 2 to 31 distinct recipients from a Linked Device number. Each recipient must pass the number’s calling restrictions and your team’s destination policy. Cloud API numbers refuse this operation.'
  static override examples = [
    '<%= config.bin %> calls place-group --to +15550100 --to +15550101 --session support',
  ]
  static override flags = {
    ...CallsPlace.flags,
    to: Flags.string({
      description:
        'E.164 phone number or public user ID. Repeat for each recipient.',
      multiple: true,
      required: true,
    }),
  }
  static override summary = 'Place an ad-hoc group call.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsPlaceGroup)
    const environment = await this.messagingEnvironment(flags)
    const result = await placeCall(
      createMessagingClient(environment),
      environment.credential,
      {
        to: flags.to,
        session: flags.session,
        video: flags.video,
        exclusive: flags.exclusive,
        participant: flags.participant,
      },
    )
    this.writeValue(result, renderPlacedCall(result.data), flags)
  }
}
