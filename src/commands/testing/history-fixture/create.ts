import {Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {readJsonInput} from '../../../api/request.js'
import {BaseCommand} from '../../../base-command.js'

export default class TestingHistoryFixtureCreate extends BaseCommand {
  static override description =
    'Upload a project-scoped simulated history fixture for a test QuickLink.'
  static override flags = {
    input: Flags.string({
      description: 'JSON file or - for stdin, containing a messages array.',
      required: true,
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(TestingHistoryFixtureCreate)
    if (!flags.project)
      throw new PolymorfaConfigurationError(
        'Select a project with --project.',
        'project',
      )
    const input = await readJsonInput(flags.input)
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      !('messages' in input) ||
      !Array.isArray(input.messages)
    )
      throw new PolymorfaConfigurationError(
        'Fixture input must contain a messages array.',
        'input',
      )
    const response = await (
      await this.messagingClient(flags, {serverApiKeyOnly: 'Testing history'})
    ).raw.request<{fixtureId: string}>({
      method: 'POST',
      path: `/messaging/projects/${encodeURIComponent(flags.project)}/test-history-fixtures`,
      body: input,
    })
    this.writeValue(
      {data: response.data, metadata: response.metadata},
      response.data.fixtureId,
      flags,
    )
  }
}
