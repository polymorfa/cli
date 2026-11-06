import {PolymorfaConfigurationError} from '@polymorfa/sdk'
import {Flags} from '@oclif/core'
import {readJsonInput} from '../../api/request.js'
import {BaseCommand} from '../../base-command.js'
import {limitValue} from '../../services/billing-controls.js'
import {createQuickLink} from '../../services/quicklinks.js'

export default class QuickLinkCreate extends BaseCommand {
  static override description =
    'Create a persistent real or simulated onboarding QuickLink.'
  static override flags = {
    purpose: Flags.string({
      options: ['initial', 'add_connection'] as const,
      description: 'Initial setup or add a connection to an existing Number.',
    }),
    'connection-goal': Flags.string({
      options: ['single', 'hybrid'] as const,
      description: 'One connection or authorized Hybrid setup.',
    }),
    session: Flags.string({
      description: 'Existing Number for an added connection.',
    }),
    'add-connection': Flags.string({
      options: ['linked_devices', 'official_api'] as const,
      description: 'Missing connection to add.',
    }),
    'limit-credits': Flags.string({
      description:
        'Initial monthly limit in credits; team billing:manage credential required.',
    }),
    priority: Flags.integer({
      min: 0,
      max: 1000000,
      description: 'Initial number funding priority.',
    }),
    input: Flags.string({
      description:
        'JSON request file or - for stdin. Use configuration for connection, phone, history and simulation.',
    }),
  }
  async run(): Promise<void> {
    const {flags} = await this.parse(QuickLinkCreate)
    const input = flags.input ? await readJsonInput(flags.input) : {}
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new PolymorfaConfigurationError(
        'QuickLink input must be an object.',
        'input',
      )
    const body = {...input} as Record<string, unknown>
    for (const [key, value] of Object.entries({
      purpose: flags.purpose,
      connectionGoal: flags['connection-goal'],
      session: flags.session,
      addConnection: flags['add-connection'],
    })) {
      if (value === undefined) continue
      if (body[key] !== undefined && body[key] !== value)
        throw new PolymorfaConfigurationError(
          `Input ${key} conflicts with its flag.`,
          'input',
        )
      body[key] = value
    }
    if (flags['limit-credits'] !== undefined || flags.priority !== undefined) {
      if (body.billingControls !== undefined)
        throw new PolymorfaConfigurationError(
          'Use either input billingControls or financial flags.',
          'input',
        )
      body.billingControls = {
        limitCredits:
          flags['limit-credits'] === undefined
            ? null
            : limitValue(flags['limit-credits'], false),
        priority: flags.priority ?? 0,
      }
    }
    if (
      body.purpose === 'add_connection' &&
      (!body.session || !body.addConnection || body.connectionGoal === 'single')
    )
      throw new PolymorfaConfigurationError(
        'Adding a connection requires --session and --add-connection with the hybrid goal.',
        'input',
      )
    const linkedProject = await this.linkedProject(flags)
    const useInputProject =
      flags.project === undefined &&
      linkedProject === undefined &&
      typeof body.projectId === 'string'
    const selectedFlags = useInputProject
      ? {...flags, project: body.projectId as string}
      : flags
    if (useInputProject) delete body.projectId
    const {client, projectId} = await this.quickLinksClient(selectedFlags)
    const result = await createQuickLink(client, body, projectId)
    this.writeValue(result, result.data.url, flags)
  }
}
