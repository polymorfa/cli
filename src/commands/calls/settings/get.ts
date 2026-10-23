import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createCallSettingsClient} from '../../../sdk/client.js'
import {renderCallSettings, viewCallSettings} from '../../../services/calls.js'

export default class CallsSettingsGet extends BaseCommand {
  static override description =
    'Read a session’s call settings from the Platform API. Sessions without saved settings return the defaults at revision 0. Pass the revision to `calls settings set --expected-revision` so a change cannot overwrite another one. After simultaneous calls are turned off, it also prints when the Ban Insurance exclusion ends (simultaneousCallsCoverageExcludedUntil), until that time passes. Ban Insurance excludes a ban when simultaneous calls were on during the 30 days before it; this timestamp is the cutoff for a new ban from that period. No end is printed while simultaneous calls are on, and a missing end does not mean the number is covered. Requires a server API key.'

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
