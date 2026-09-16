import {Flags} from '@oclif/core'
import {
  PolymorfaValidationError,
  type OperationKind,
  type OperationStatus,
} from '@polymorfa/sdk'

import {BaseCommand} from '../../base-command.js'
import {paginationFlags} from '../../developer/flags.js'
import {developerRead} from '../../developer/output.js'
import {
  assertCursorNotCombined,
  listResources,
  paginationInput,
} from '../../developer/support.js'
import {optionalTimeRange} from '../../input/time.js'

export default class OperationList extends BaseCommand {
  static override description = 'List durable operations for an explicit owner.'

  static override flags = {
    ...paginationFlags,
    kind: Flags.string({description: 'Filter by operation kind.'}),
    resource: Flags.string({
      description: 'Filter by a resource as TYPE:ID.',
    }),
    since: Flags.string({
      description: 'Include operations at or after this RFC 3339 time.',
    }),
    status: Flags.string({
      description: 'Filter by operation status.',
      options: [
        'pending',
        'running',
        'action_required',
        'cancelling',
        'succeeded',
        'failed',
        'cancelled',
      ],
    }),
    until: Flags.string({
      description: 'Include operations before this RFC 3339 time.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(OperationList)
    assertCursorNotCombined(flags.cursor, [
      flags.kind,
      flags.resource,
      flags.since,
      flags.status,
      flags.until,
    ])
    const resource = parseResource(flags.resource)
    const time = optionalTimeRange(flags.since, flags.until)
    const session = await this.developerSession(flags)
    const result = await listResources(
      paginationInput(flags),
      ({cursor, limit}) =>
        session.client.operations.list(
          {
            ...(cursor === undefined ? {} : {cursor}),
            ...(flags.kind === undefined
              ? {}
              : {kind: flags.kind as OperationKind}),
            limit,
            ...(resource === undefined
              ? {}
              : {resourceId: resource.id, resourceType: resource.type}),
            ...time,
            ...(flags.status === undefined
              ? {}
              : {status: flags.status as OperationStatus}),
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
      renderOperations(result.items),
      flags,
    )
  }
}

function parseResource(
  value: string | undefined,
): {readonly id: string; readonly type: string} | undefined {
  if (value === undefined) return undefined
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) {
    throw new PolymorfaValidationError(
      '--resource must use TYPE:ID with both values present.',
      {code: 'invalid_operation_filter'},
    )
  }
  return {id: value.slice(separator + 1), type: value.slice(0, separator)}
}

function renderOperations(
  operations: readonly {
    readonly id: string
    readonly kind: string
    readonly status: string
  }[],
): string {
  if (operations.length === 0) return 'No operations found.'
  return operations
    .map(
      (operation) => `${operation.id}\t${operation.status}\t${operation.kind}`,
    )
    .join('\n')
}
