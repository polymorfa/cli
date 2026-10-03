import {readFile} from 'node:fs/promises'
import {PolymorfaValidationError} from '@polymorfa/sdk'
import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {reorderPriorities} from '../../../services/billing-controls.js'
export default class PriorityReorder extends BaseCommand {
  static override summary = 'Save a complete funding order atomically.'
  static override description =
    'Requires Pay-As-You-Go and an organization key with billing:manage. Pass every active project, customer or real number for its scope. Resource scope mixes all customers and numbers in --project, highest first. Incomplete or stale orders fail without partial changes.'
  static override flags = {
    scope: Flags.string({
      options: ['project', 'customer', 'number', 'resource'],
      required: true,
    }),
    ids: Flags.string({
      exclusive: ['ids-file'],
      description:
        'UUIDs, highest first. For resource scope use customer:UUID or number:UUID.',
    }),
    'ids-file': Flags.string({
      exclusive: ['ids'],
      description: 'JSON array of ordered IDs; supports large lists.',
    }),
    'expected-revision': Flags.integer({required: true, min: 0}),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(PriorityReorder)
    let ids: unknown = flags.ids?.split(',').map((id) => id.trim())
    if (flags['ids-file']) {
      try {
        ids = JSON.parse(await readFile(flags['ids-file'], 'utf8'))
      } catch {
        throw new PolymorfaValidationError(
          'Could not read an ordered JSON array from --ids-file.',
        )
      }
    }
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
      throw new PolymorfaValidationError(
        'Use --ids or --ids-file with a complete ordered list.',
      )
    const result = await reorderPriorities(
      await this.platformClient(flags),
      flags.scope as 'project' | 'customer' | 'number' | 'resource',
      ids,
      flags['expected-revision'],
      flags.project,
    )
    this.writeValue(result, 'Priority order saved.', flags)
  }
}
