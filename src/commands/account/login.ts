import {Flags} from '@oclif/core'

import {
  AccountDeviceCommand,
  waitForAccountDevicePoll,
} from '../../account-device/command.js'
import {createAccountDeviceAuthService} from '../../account-device/factory.js'

export default class AccountLogin extends AccountDeviceCommand {
  static override description =
    'Sign in through browser approval and store only the account session in its separate OS keyring.'
  static override flags = {
    'api-origin': Flags.string({
      required: true,
      description: 'Trusted HTTPS API origin for this Polymorfa environment.',
    }),
    'console-origin': Flags.string({
      required: true,
      description: 'Trusted HTTPS Console origin for browser approval.',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AccountLogin)
    const service = createAccountDeviceAuthService()
    const result = await this.accountOperation(flags, async (signal) => {
      const login = await service.startLogin(
        flags.profile ?? 'default',
        {
          issuer: flags['api-origin'],
          consoleOrigin: flags['console-origin'],
        },
        signal,
      )
      // Only the validated approval URL and user code are displayed. No
      // browser is launched, and opaque device/session/JWT bytes stay private.
      process.stderr.write(
        `${JSON.stringify({verificationUri: login.verificationUri, userCode: login.userCode})}\n`,
      )
      try {
        for (;;) {
          await waitForAccountDevicePoll(service.pollDelay(login), signal)
          const polled = await service.pollLogin(login, signal)
          if (polled.kind === 'signedIn') return polled
        }
      } finally {
        service.cancelLogin(login)
      }
    })
    this.accountResult(result, flags)
  }
}
