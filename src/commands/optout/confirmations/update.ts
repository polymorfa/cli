import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {
  confirmationPreference,
  renderConfirmationSettings,
  updateConfirmationSettings,
} from '../../../services/stop-confirmations.js'

export default class ConfirmationSettingsUpdate extends BaseCommand {
  static override description =
    'Save an optional STOP acknowledgement preference using the observed team and revision. Enabling requires beta access and an explicit language. This write is never retried automatically; read settings after an uncertain save.'
  static override examples = [
    '<%= config.bin %> <%= command.id %> --team-id TEAM_UUID --revision 0 --no-enabled',
    '<%= config.bin %> <%= command.id %> --team-id TEAM_UUID --revision 1 --enabled --locale pt-BR',
  ]
  static override flags = {
    enabled: Flags.boolean({
      allowNo: true,
      required: true,
      description:
        'Explicitly enable acknowledgements or pass --no-enabled to disable. Suppression stays in place.',
    }),
    locale: Flags.string({
      options: ['en', 'pt-BR', 'es'],
      description:
        'Acknowledgement language; required when enabling. No language is inferred.',
    }),
    revision: Flags.integer({
      required: true,
      min: 0,
      max: 2147483646,
      description:
        'Observed settings revision from confirmations view. Stale revisions fail with 409.',
    }),
    'team-id': Flags.string({
      required: true,
      description:
        'Team UUID returned by confirmations view; must match the authenticated team.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(ConfirmationSettingsUpdate)
    const body = confirmationPreference(flags)
    const result = await updateConfirmationSettings(
      await this.platformClient(flags),
      body,
    )
    this.writeValue(result, renderConfirmationSettings(result.data), flags)
  }
}
