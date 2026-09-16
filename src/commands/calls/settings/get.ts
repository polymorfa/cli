import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createCallSettingsClient} from '../../../sdk/client.js'
import {renderCallSettings, viewCallSettings} from '../../../services/calls.js'

export default class CallsSettingsGet extends BaseCommand {
  static override description =
    'Read a session’s call settings from the Platform API. Sessions without saved settings return the defaults. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> calls settings get --session support',
  ]

  static override flags = {
    session: Flags.string({description: 'Session ID.', required: true}),
  }

  static override summary = 'Read session call settings.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsSettingsGet)
    const result = await viewCallSettings(
      createCallSettingsClient(await this.platformEnvironment(flags)),
      flags.session,
    )
    this.writeValue(
      result,
      renderCallSettings(flags.session, result.data),
      flags,
    )
  }
}
