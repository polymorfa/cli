import {Command, Flags} from '@oclif/core'
import {setTimeout} from 'node:timers/promises'

import {AccountDeviceLoginError} from './service.js'
import {AccountDeviceStorageError} from './storage.js'
import {AccountDeviceError} from './transport.js'

interface AccountFlags {
  readonly json?: boolean | undefined
  readonly profile?: string | undefined
  readonly timeout?: number | undefined
}

// This command family has no machine environment resolver, API-version/owner
// override, raw route, credential argument or SDK client factory.
export abstract class AccountDeviceCommand extends Command {
  static override baseFlags = {
    json: Flags.boolean({description: 'Print one JSON result.'}),
    profile: Flags.string({
      description:
        'Select an account-device profile, separate from machine profiles.',
    }),
    timeout: Flags.integer({
      min: 1,
      description: 'Cancel this operation after this many milliseconds.',
    }),
  }

  protected async accountOperation<T>(
    flags: AccountFlags,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const canceled = new AbortController()
    const interrupt = () => canceled.abort()
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    const signal =
      flags.timeout === undefined
        ? canceled.signal
        : AbortSignal.any([canceled.signal, AbortSignal.timeout(flags.timeout)])
    try {
      return await operation(signal)
    } catch (error) {
      const known =
        error instanceof AccountDeviceError ||
        error instanceof AccountDeviceStorageError ||
        error instanceof AccountDeviceLoginError
      const message = known
        ? error.message
        : 'The account-device operation could not be completed.'
      if (flags.json) {
        process.stderr.write(
          `${JSON.stringify({
            error: {
              code:
                error instanceof AccountDeviceError ||
                error instanceof AccountDeviceStorageError
                  ? error.code
                  : error instanceof AccountDeviceLoginError
                    ? 'login_not_confirmed'
                    : 'account_device_failed',
              message,
              ...(error instanceof AccountDeviceLoginError
                ? {recovery: error.recovery}
                : {}),
            },
          })}\n`,
        )
        this.exit(1)
      }
      this.error(message, {exit: 1})
    } finally {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', interrupt)
    }
  }

  protected accountResult(value: unknown, flags: AccountFlags): void {
    this.log(JSON.stringify(value, null, flags.json ? undefined : 2))
  }
}

export async function waitForAccountDevicePoll(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  await setTimeout(milliseconds, undefined, {signal})
}
