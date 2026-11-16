import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {reportIncident} from '../../../services/bansafe.js'

export default class BanSafeIncidentReport extends BaseCommand {
  static override description = 'Report a customer-observed BanSafe incident.'
  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this incident report.',
      required: true,
    }),
    note: Flags.string({description: 'Optional incident context.'}),
    'occurred-at': Flags.string({description: 'Observed ISO 8601 instant.'}),
    connection: Flags.string({
      description: 'Connection ID or name.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(BanSafeIncidentReport)
    const result = await reportIncident(
      await this.platformClient(flags),
      {
        connection: flags.connection,
        ...(flags.note === undefined ? {} : {note: flags.note}),
        ...(flags['occurred-at'] === undefined
          ? {}
          : {occurredAt: flags['occurred-at']}),
      },
      {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Recorded BanSafe incident ${result.data.incidentId}.`,
      flags,
    )
  }
}
