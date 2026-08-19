import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {acknowledgeSecurityIncident} from '../../services/platform-management.js'

export default class SecurityIncidentAcknowledge extends BaseCommand {
  static override args = {
    incident: Args.string({
      description: 'Security incident ID.',
      required: true,
    }),
  }

  static override description = 'Acknowledge a security incident.'

  static override flags = {
    'idempotency-key': Flags.string({
      description: 'Identify retries of this repeatable acknowledgement.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SecurityIncidentAcknowledge)
    const result = await acknowledgeSecurityIncident(
      await this.platformClient(flags),
      args.incident,
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(
      result,
      `Acknowledged security incident ${args.incident}.`,
      flags,
    )
  }
}
