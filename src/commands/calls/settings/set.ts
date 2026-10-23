import {Flags} from '@oclif/core'

import {BaseCommand} from '../../../base-command.js'
import {createCallSettingsClient} from '../../../sdk/client.js'
import {
  renderCallSettings,
  updateCallSettings,
} from '../../../services/calls.js'

export default class CallsSettingsSet extends BaseCommand {
  static override description =
    'Change a session’s call settings through the Platform API. Settings you do not pass keep their current values; --inbound-route sip_trunk without --sip-trunk keeps the stored trunk. --calls-enabled=false turns calling off for the session: placing, answering and joining calls fail, incoming calls are declined and SIP trunks cannot call through it, while calls in progress continue. --expected-revision applies the change only if the settings still have that revision (see `calls settings get`); otherwise the command fails with state_conflict (exit code 4) and changes nothing. --conference-mode (on by default) lets every participant you connect to a call (apps, bots and SIP trunk callers) hear the WhatsApp party and each other; --no-conference-mode lets each hear only the WhatsApp party. The WhatsApp party always hears all of your participants, and nobody hears their own audio. --inbound-route sip_trunk also sends incoming calls to --sip-trunk, and --sip-claim controls whether the trunk’s answer claims the call. --host-cloud-api-calls=true has Polymorfa Calls answer a Cloud API session’s incoming calls instead of your Graph API integration. --simultaneous-calls=true lets a linked-device number hold any number of calls at once (incoming, placed and campaign calls); Cloud API numbers ignore it. WhatsApp’s own apps never hold two calls at once, and while it is on, and for 30 days after you turn it off, Ban Insurance does not cover a ban of the number. Turning it on therefore requires --acknowledge-risk, and the command exits with code 2 without changing anything when that flag is missing. After --simultaneous-calls=false, the output shows when the Ban Insurance exclusion ends, from the server’s response. Only a team API key can turn it on; --simultaneous-calls=false needs no acknowledgment. Requires a server API key.'

  static override examples = [
    '<%= config.bin %> calls settings set --session support --calls-enabled=false',
    '<%= config.bin %> calls settings set --session support --no-conference-mode',
    '<%= config.bin %> calls settings set --session support --calls-enabled=false --expected-revision 3',
    '<%= config.bin %> calls settings set --session support --inbound-route sip_trunk --sip-trunk 6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10',
    '<%= config.bin %> calls settings set --session support --inbound-route clients',
    '<%= config.bin %> calls settings set --session support --simultaneous-calls=true --acknowledge-risk',
    '<%= config.bin %> calls settings set --session support --simultaneous-calls=false',
  ]

  static override flags = {
    'acknowledge-risk': Flags.boolean({
      description:
        'Confirm that turning simultaneous calls on removes Ban Insurance cover for the number. Required with --simultaneous-calls=true.',
    }),
    'calls-enabled': Flags.string({
      description: 'Allow calls on the session (false turns calling off).',
      options: ['true', 'false'],
    }),
    'conference-mode': Flags.boolean({
      allowNo: true,
      description:
        'Let your participants hear each other as well as the WhatsApp party (--no-conference-mode: only the WhatsApp party).',
    }),
    'expected-revision': Flags.integer({
      description:
        'Apply the change only if the settings still have this revision.',
      min: 0,
    }),
    'host-cloud-api-calls': Flags.string({
      description:
        'On a Cloud API session, answer incoming calls with Polymorfa Calls (false leaves them to your Graph API integration).',
      options: ['true', 'false'],
    }),
    'inbound-route': Flags.string({
      description:
        'Where incoming calls ring: clients, or sip_trunk to also send them to a SIP trunk.',
      options: ['clients', 'sip_trunk'],
    }),
    session: Flags.string({description: 'Session ID.', required: true}),
    'sip-claim': Flags.string({
      description:
        'Whether an answer from the SIP trunk claims the call and stops other clients ringing.',
      options: ['true', 'false'],
    }),
    'simultaneous-calls': Flags.string({
      description:
        'Let a linked-device number hold any number of calls at once (true requires --acknowledge-risk; false turns it off).',
      options: ['true', 'false'],
    }),
    'sip-trunk': Flags.string({
      description: 'SIP trunk ID that receives incoming calls.',
    }),
  }

  static override summary = 'Change session call settings.'

  async run(): Promise<void> {
    const {flags} = await this.parse(CallsSettingsSet)
    const result = await updateCallSettings(
      createCallSettingsClient(await this.platformEnvironment(flags)),
      flags.session,
      {
        ...(flags['calls-enabled'] === undefined
          ? {}
          : {callsEnabled: flags['calls-enabled'] === 'true'}),
        ...(flags['expected-revision'] === undefined
          ? {}
          : {expectedRevision: flags['expected-revision']}),
        ...(flags['host-cloud-api-calls'] === undefined
          ? {}
          : {hostCloudApiCalls: flags['host-cloud-api-calls'] === 'true'}),
        ...(flags['conference-mode'] === undefined
          ? {}
          : {conferenceMode: flags['conference-mode']}),
        ...(flags['inbound-route'] === undefined
          ? {}
          : {
              inboundRoute: flags['inbound-route'] as 'clients' | 'sip_trunk',
            }),
        ...(flags['sip-claim'] === undefined
          ? {}
          : {sipClaim: flags['sip-claim'] === 'true'}),
        ...(flags['sip-trunk'] === undefined
          ? {}
          : {sipTrunkId: flags['sip-trunk']}),
        ...(flags['simultaneous-calls'] === undefined
          ? {}
          : {simultaneousCalls: flags['simultaneous-calls'] === 'true'}),
        ...(flags['acknowledge-risk'] ? {acknowledgeRisk: true} : {}),
      },
    )
    this.writeValue(
      result,
      renderCallSettings(flags.session, result.data),
      flags,
    )
  }
}
