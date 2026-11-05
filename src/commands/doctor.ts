import {BaseCommand} from '../base-command.js'
import {SecureCredentialStore} from '../config/credentials.js'
import {ProfileRepository} from '../config/profiles.js'
import {runDoctor} from '../services/doctor.js'

export default class Doctor extends BaseCommand {
  static override description =
    'Check Node.js, config, keyring access, API reachability, and server API key validity. Exits 1 if validation fails or is skipped.'

  static override examples = [
    '<%= config.bin %> doctor',
    '<%= config.bin %> doctor --profile work --json',
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(Doctor)
    const credentials = new SecureCredentialStore()
    const report = await runDoctor({
      credentials: {
        ...credentials,
        delete: (account) => credentials.delete(account),
        get: async (account) => {
          const value = await credentials.get(account)
          if (value !== undefined) this.registerSecret(value)
          return value
        },
        set: (account, value) => credentials.set(account, value),
      },
      env: process.env,
      profile: flags.profile,
      profiles: new ProfileRepository(),
      timeoutMs: flags.timeout,
    })
    for (const value of [
      process.env.POLYMORFA_API_KEY,
      process.env.POLYMORFA_PROJECT_TOKEN,
      process.env.POLYMORFA_CLIENT_TOKEN,
    ]) {
      if (value !== undefined) this.registerSecret(value)
    }
    const human = report.checks
      .map(
        (check) =>
          `${check.status.toUpperCase().padEnd(4)} ${check.name.padEnd(10)} ${check.detail}`,
      )
      .join('\n')
    this.writeValue(report, human, flags)
    if (!report.ok) process.exitCode = 1
  }
}
