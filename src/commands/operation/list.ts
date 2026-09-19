import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {operationsFor} from '../../developer/operations.js'
import {paginationFlags} from '../../developer/flags.js'
import {developerRead} from '../../developer/output.js'
import {
  assertCursorNotCombined,
  listResources,
  paginationInput,
} from '../../developer/support.js'
import {optionalTimeRange} from '../../input/time.js'
import {OPERATION_STATUSES, renderOperationLine} from './shared.js'

export default class OperationList extends BaseCommand {
  static override description =
    'List asynchronous operations, newest first. Team owners see team and project operations; project owners see one project.'

  static override examples = [
    '<%= config.bin %> operation list --status running',
    '<%= config.bin %> operation list --resource-type campaign --resource-id <campaign-id> --json',
  ]

  static override flags = {
    ...paginationFlags,
    kind: Flags.string({
      description: 'Filter by operation kind, for example campaign.',
    }),
    'resource-id': Flags.string({
      dependsOn: ['resource-type'],
      description: 'Filter by resource ID. Requires --resource-type.',
    }),
    'resource-type': Flags.string({
      dependsOn: ['resource-id'],
      description: 'Filter by resource type. Requires --resource-id.',
    }),
    since: Flags.string({
      description: 'Include operations created at or after this RFC 3339 time.',
    }),
    status: Flags.string({
      description: 'Filter by status.',
      options: [...OPERATION_STATUSES],
    }),
    until: Flags.string({
      description: 'Include operations created before this RFC 3339 time.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(OperationList)
    assertCursorNotCombined(flags.cursor, [
      flags.kind,
      flags['resource-id'],
      flags['resource-type'],
      flags.since,
      flags.status,
      flags.until,
    ])
    const time = optionalTimeRange(flags.since, flags.until)
    const session = await this.developerSession(flags)
    const result = await listResources(
      paginationInput(flags),
      ({cursor, limit}) =>
        operationsFor(session).list(
          {
            ...(cursor === undefined ? {} : {cursor}),
            limit,
            ...time,
            ...(flags.status === undefined ? {} : {status: flags.status}),
            ...(flags.kind === undefined ? {} : {kind: flags.kind}),
            ...(flags['resource-type'] === undefined
              ? {}
              : {
                  resourceId: flags['resource-id'],
                  resourceType: flags['resource-type'],
                }),
          },
          session.requestOptions,
        ),
    )
    this.writeValue(
      developerRead(
        result.items,
        result.metadata,
        session.context,
        result.page,
      ),
      result.items.length === 0
        ? 'No operations found.'
        : result.items
            .map((operation) => renderOperationLine(operation))
            .join('\n'),
      flags,
    )
  }
}
