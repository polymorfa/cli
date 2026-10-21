import {Args, Flags} from '@oclif/core'
import {open} from 'node:fs/promises'
import {PolymorfaValidationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../../base-command.js'
import {cloudResult, requestKey} from '../../../services/cloud.js'
export default class CloudGroupPicture extends BaseCommand {
  static override description =
    'Replace an Official-only group picture (beta, groups:manage). JPEG, square, at least 192 x 192 pixels, at most 5 MB. Hybrid Numbers use group picture through Linked Devices only; no Official fallback.'
  static override args = {
    group: Args.string({description: 'Group conversation ID.', required: true}),
  }
  static override flags = {
    session: Flags.string({
      description: 'Official-only Number ID.',
      required: true,
    }),
    file: Flags.string({
      description: 'Local JPEG file; uploaded as multipart bytes.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description: 'Fence an explicit retry after checking the outcome.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(CloudGroupPicture)
    const handle = await open(flags.file, 'r')
    let bytes: Buffer
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size === 0 || stat.size > 5 * 1024 * 1024)
        throw new PolymorfaValidationError(
          'Provide a JPEG file of 1 byte to 5 MB.',
        )
      bytes = Buffer.alloc(stat.size + 1)
      const {bytesRead} = await handle.read(bytes, 0, bytes.length, 0)
      if (bytesRead !== stat.size)
        throw new PolymorfaValidationError(
          'Picture changed during reading; try again after the file is stable.',
        )
      bytes = bytes.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Official API',
    })
    const response = await client.officialGroups.setPicture(
      flags.session,
      args.group,
      new Blob([Uint8Array.from(bytes)], {type: 'image/jpeg'}),
      requestKey(flags['idempotency-key']),
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
