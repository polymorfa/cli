import {Args, Flags} from '@oclif/core'

import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {renderSipTrunk, updateSipTrunk} from '../../services/sip-trunks.js'

export default class SipTrunkUpdate extends BaseCommand {
  static override args = {
    trunk: Args.string({description: 'SIP trunk ID.', required: true}),
  }

  static override description =
    'Change a SIP trunk. Fields you omit keep their values; omit authPassword to keep the stored password. Changes reach new calls within about a minute. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> sip-trunk update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --disable --expected-revision 3',
    '<%= config.bin %> sip-trunk update 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10 --input changes.json',
  ]

  static override flags = {
    disable: Flags.boolean({
      description: 'Stop new calls on the trunk.',
      exclusive: ['enable'],
    }),
    enable: Flags.boolean({
      description: 'Allow new calls on the trunk.',
      exclusive: ['disable'],
    }),
    'expected-revision': Flags.integer({
      description:
        'Refuse the change if the trunk no longer has this revision.',
      min: 1,
    }),
    input: Flags.string({
      description: 'Read the JSON changes from a file or stdin (-).',
    }),
  }

  static override summary = 'Change a SIP trunk.'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SipTrunkUpdate)
    const input =
      flags.input === undefined ? undefined : await readJsonInput(flags.input)
    const result = await updateSipTrunk(
      await this.platformClient(flags),
      args.trunk,
      input,
      {
        ...(flags.enable === true ? {enabled: true} : {}),
        ...(flags.disable === true ? {enabled: false} : {}),
        ...(flags['expected-revision'] === undefined
          ? {}
          : {expectedRevision: flags['expected-revision']}),
      },
    )
    this.writeValue(result, renderSipTrunk(result.data), flags)
  }
}
