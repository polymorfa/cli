import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {retractIncident} from '../../../services/bansafe.js'

export default class BanSafeIncidentRetract extends BaseCommand {
  static override args = {
    incident: Args.string({description: 'Incident ID.', required: true}),
  }
  static override description =
    'Retract one customer-reported BanSafe incident.'
  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this retraction.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BanSafeIncidentRetract)
    const result = await retractIncident(
      await this.platformClient(flags),
      args.incident,
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Retracted BanSafe incident ${args.incident}.`,
      flags,
    )
  }
}
