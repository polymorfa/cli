import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {
  listAuditLogs,
  renderAuditLogs,
} from '../../services/platform-management.js'

export default class AuditLogList extends BaseCommand {
  static override description = 'List organization audit log entries.'

  static override flags = {
    action: Flags.string({description: 'Match one exact audit action.'}),
    limit: Flags.integer({
      description: 'Maximum entries to return (default 100).',
      max: 500,
      min: 1,
    }),
    resource: Flags.string({description: 'Match one exact resource type.'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuditLogList)
    const result = await listAuditLogs(await this.platformClient(flags), {
      ...(flags.action === undefined ? {} : {action: flags.action}),
      ...(flags.resource === undefined ? {} : {resource: flags.resource}),
      ...(flags.limit === undefined ? {} : {limit: flags.limit}),
    })
    this.writeValue(result, renderAuditLogs(result.data), flags)
  }
}
