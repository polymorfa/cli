import {Args, Flags} from '@oclif/core'
import {readFile, stat} from 'node:fs/promises'
import {PolymorfaValidationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../base-command.js'
import {idempotencyOptions} from '../../input/message-send.js'
export default class GroupPicture extends BaseCommand {
  static override description =
    'Replace a Linked Devices group picture. Hybrid Numbers always use Linked Devices; hybrid_group_linked_devices_unavailable means not executed. Never fall back to Official.'
  static override args = {
    group: Args.string({description: 'Group conversation ID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Linked Devices or Hybrid Number ID.',
      required: true,
    }),
    url: Flags.string({
      description: 'Picture URL fetched by the Messaging service.',
      exclusive: ['file'],
    }),
    file: Flags.string({
      description: 'Local picture, at most 5 MB, sent as base64 JSON.',
      exclusive: ['url'],
    }),
    'idempotency-key': Flags.string({
      description: 'Safely identify retries of this change.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(GroupPicture)
    if (flags.url === undefined && flags.file === undefined)
      throw new PolymorfaValidationError('Provide --file or --url.')
    let body: {url?: string; base64?: string} = {}
    if (flags.file !== undefined) {
      const info = await stat(flags.file)
      if (!info.isFile() || info.size === 0 || info.size > 5 * 1024 * 1024)
        throw new PolymorfaValidationError(
          'Picture must be a nonempty file of at most 5 MB.',
        )
      const bytes = await readFile(flags.file)
      if (bytes.length > 5 * 1024 * 1024)
        throw new PolymorfaValidationError('Picture exceeds 5 MB.')
      body = {base64: bytes.toString('base64')}
    } else {
      body = {url: flags.url!}
    }
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Groups',
    })
    const response = await client.groups.setPicture(
      flags.session,
      args.group,
      body,
      idempotencyOptions(flags['idempotency-key']),
    )
    this.writeValue(response, `Updated group ${args.group} picture.`, flags)
  }
}
