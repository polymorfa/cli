import {Flags} from '@oclif/core'
import type {SendLocationMessageRequest} from '@polymorfa/sdk'

import {BaseCommand} from '../../../base-command.js'
import {
  idempotencyOptions,
  sendContext,
  sendContextFlags,
} from '../../../input/message-send.js'
import {parseCoordinate} from '../../../services/message-content.js'
import {sendMessage} from '../../../services/messages.js'

export default class MessageSendLocation extends BaseCommand {
  static override description = 'Send a location pin.'

  static override examples = [
    '<%= config.bin %> message send location --session session_123 --to +15551234567 --lat 51.5007 --long=-0.1246 --address "Westminster, London"',
  ]

  static override flags = {
    ...sendContextFlags,
    address: Flags.string({description: 'Address shown with the pin.'}),
    lat: Flags.string({description: 'Latitude in degrees.', required: true}),
    long: Flags.string({
      description:
        'Longitude in degrees. Use --long=-0.12 for negative values.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MessageSendLocation)
    const request: SendLocationMessageRequest = {
      ...sendContext(flags),
      content: {
        location: {
          lat: parseCoordinate(flags.lat, 'lat'),
          long: parseCoordinate(flags.long, 'long'),
          ...(flags.address === undefined ? {} : {address: flags.address}),
        },
      },
    }
    const result = await sendMessage(
      await this.messagingClient(flags),
      flags.session,
      request,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(
      result,
      `Sent location message ${result.data.id} to ${flags.to}.`,
      flags,
    )
  }
}
