import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {
  setTestingAccountMode,
  testingAccountTypes,
} from '../../services/testing-account-mode.js'

export default class TestingAccountMode extends BaseCommand {
  static override description =
    'Change a Test number account mode. A change unlinks every companion, which must pair again.'
  static override args = {
    session: Args.string({
      required: true,
      description: 'The Test number session ID.',
    }),
  }
  static override flags = {
    'account-type': Flags.string({
      required: true,
      options: [...testingAccountTypes],
      description: 'Account mode to emulate.',
    }),
    'primary-platform': Flags.string({
      options: ['android', 'ios'],
      description: 'Phone platform. Omit for Official API mode.',
    }),
    yes: Flags.boolean({
      required: true,
      description: 'Confirm unlinking all companions if the mode changes.',
    }),
  }
  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestingAccountMode)
    const response = await setTestingAccountMode(
      await this.messagingClient(flags, {
        serverCredentialOnly: 'Testing account mode',
      }),
      args.session,
      {
        accountType: flags['account-type'],
        ...(flags['primary-platform'] === undefined
          ? {}
          : {primaryPlatform: flags['primary-platform']}),
      },
    )
    this.writeValue(
      response,
      response.data.changed
        ? `Account mode changed to ${response.data.accountType}. ${response.data.unlinkedDevices.length} companions must pair again.`
        : `Account mode is already ${response.data.accountType}.`,
      flags,
    )
  }
}
