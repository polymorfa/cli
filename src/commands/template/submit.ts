import {Args, Flags} from '@oclif/core'
import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {BaseCommand} from '../../base-command.js'
import {cloudResult} from '../../services/cloud.js'

export default class TemplateSubmit extends BaseCommand {
  static override description =
    'Submit a saved project template for Meta approval (beta). Requires templates:manage. Makes one attempt; an accepted submission is not approval.'

  static override args = {
    template: Args.string({
      description: 'Saved project template ID.',
      required: true,
    }),
  }

  static override flags = {
    'project-slug': Flags.string({
      description: 'Project slug that owns the template.',
      required: true,
    }),
    session: Flags.string({
      description: 'Official API Number ID in the same project.',
      required: true,
    }),
    yes: Flags.boolean({
      description: 'Confirm one submission attempt to Meta.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TemplateSubmit)
    if (!flags.yes)
      throw new PolymorfaConfigurationError(
        'Pass --yes to submit this project template for Meta approval.',
        'yes',
      )

    const client = await this.messagingClient(flags, {
      serverCredentialOnly: 'Project template submission',
    })
    const response = await client.templates.submit(
      flags['project-slug'],
      args.template,
      {session: flags.session},
      {maxNetworkRetries: 0},
    )
    const result = cloudResult(response)
    this.writeValue(result, JSON.stringify(result.data, null, 2), flags)
  }
}
