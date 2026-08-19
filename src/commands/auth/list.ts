import {BaseCommand} from '../../base-command.js'
import {createAuthService} from '../../config/auth-service.js'

export default class AuthList extends BaseCommand {
  static override description = 'List configured authentication profiles.'

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthList)
    const profiles = await createAuthService().list()
    const human =
      profiles.length === 0
        ? 'No authentication profiles are configured.'
        : profiles
            .map(
              (profile) =>
                `${profile.active ? '*' : ' '} ${profile.name}\t${profile.credentialKind}`,
            )
            .join('\n')
    this.writeValue(profiles, human, flags)
  }
}
