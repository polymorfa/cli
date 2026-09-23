import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {
  optOutSettingsUpdate,
  renderOptOutSettings,
  updateOptOutSettings,
} from '../../../services/opt-outs.js'

export default class OptOutSettingsUpdate extends BaseCommand {
  static override description =
    'Replace the organization’s STOP and START keyword capture settings. Every field is replaced, so pass the complete keyword set.'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --enabled --opt-out-keyword STOP --opt-out-keyword BAJA --opt-in-keyword START',
    '<%= config.bin %> <%= command.id %> --no-enabled --opt-out-keyword STOP',
  ]

  static override flags = {
    enabled: Flags.boolean({
      allowNo: true,
      description:
        'Capture keyword replies. Pass --no-enabled to stop capturing.',
      required: true,
    }),
    'idempotency-key': Flags.string({
      description:
        'Send this Idempotency-Key header. None is generated when omitted.',
    }),
    'opt-in-keyword': Flags.string({
      description: 'A keyword that opts a contact back in. Repeatable.',
      multiple: true,
    }),
    'opt-out-keyword': Flags.string({
      description:
        'A keyword that suppresses a contact. Repeatable; at least one is required.',
      multiple: true,
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(OptOutSettingsUpdate)
    const result = await updateOptOutSettings(
      await this.platformClient(flags),
      optOutSettingsUpdate(flags),
      flags['idempotency-key'] === undefined
        ? {}
        : {idempotencyKey: flags['idempotency-key']},
    )
    this.writeValue(result, renderOptOutSettings(result.data), flags)
  }
}
