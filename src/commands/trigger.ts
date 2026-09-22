import {Args, Flags} from '@oclif/core'
import {
  PolymorfaConfigurationError,
  TEST_EVENT_FIXTURES,
  type TestEventFixture,
  type TestEventOverrides,
  type TriggerTestEventRequest,
} from '@polymorfa/sdk'
import {BaseCommand} from '../base-command.js'

const BOOLEAN_OVERRIDES = new Set<keyof TestEventOverrides>(['video'])
const INTEGER_OVERRIDES = new Set<keyof TestEventOverrides>(['durationSeconds'])

export default class Trigger extends BaseCommand {
  static override description =
    'Send a signed test event for a Test number to your webhooks, event history, and a running `polymorfa listen`. Real numbers are refused.'
  static override args = {
    event: Args.string({
      description: 'Fixture name; each name is the event type it produces.',
      options: [...TEST_EVENT_FIXTURES],
      required: false,
    }),
  }
  static override flags = {
    list: Flags.boolean({
      description: 'List fixtures and the overrides each accepts.',
      exclusive: ['override', 'session', 'text', 'from', 'from-session'],
    }),
    session: Flags.string({
      description: 'Test number session name in the project.',
    }),
    override: Flags.string({
      description:
        'Override a payload field as key=value, for example ackStatus=read. Repeat for several fields.',
      multiple: true,
    }),
    text: Flags.string({
      description: 'Shortcut for --override text=<value>.',
    }),
    from: Flags.string({
      description: 'Shortcut for --override from=<E.164 phone>.',
    }),
    'from-session': Flags.string({
      description:
        'message.received only: send a simulated message from this other Test number instead of generating an event.',
    }),
  }
  static override examples = [
    '<%= config.bin %> trigger --list --project <projectId>',
    '<%= config.bin %> trigger message.received --session my-test-number --text "hi" --project <projectId>',
    '<%= config.bin %> trigger message.ack --session my-test-number --override ackStatus=read --project <projectId>',
    '<%= config.bin %> trigger template.status --session my-test-number --override templateStatus=REJECTED --override reason=INVALID_FORMAT --project <projectId>',
    '<%= config.bin %> trigger bansafe.enforcement --session my-test-number --override enforcementKind=temporary_ban --project <projectId>',
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Trigger)
    if (!flags.project)
      throw new PolymorfaConfigurationError(
        'Select a project with --project.',
        'project',
      )
    const client = await this.messagingClient(flags, {
      serverApiKeyOnly: 'Test event',
    })

    if (flags.list) {
      const response = await client.testing.listEventFixtures(flags.project)
      const human = response.data.fixtures
        .map(
          (fixture) =>
            `${fixture.name.padEnd(22)} ${fixture.description}${
              fixture.overrides.length > 0
                ? `\n${' '.repeat(23)}overrides: ${fixture.overrides.join(', ')}`
                : ''
            }`,
        )
        .join('\n')
      this.writeValue(
        {data: response.data, metadata: response.metadata},
        human,
        flags,
      )
      return
    }

    if (args.event === undefined)
      throw new PolymorfaConfigurationError(
        `Name a fixture: ${TEST_EVENT_FIXTURES.join(', ')}. Use --list to see overrides.`,
        'event',
      )
    if (!flags.session)
      throw new PolymorfaConfigurationError(
        'Select the Test number with --session.',
        'session',
      )

    const overrides = parseOverrides(flags.override ?? [])
    for (const [key, value] of [
      ['text', flags.text],
      ['from', flags.from],
    ] as const) {
      if (value === undefined) continue
      if (key in overrides)
        throw new PolymorfaConfigurationError(
          `Pass ${key} once: use either --${key} or --override ${key}=..., not both.`,
          'override',
        )
      overrides[key] = value
    }
    const request: TriggerTestEventRequest = {
      session: flags.session,
      event: args.event as TestEventFixture,
      ...(Object.keys(overrides).length > 0 ? {overrides} : {}),
      ...(flags['from-session'] === undefined
        ? {}
        : {fromSession: flags['from-session']}),
    }
    const response = await client.testing.triggerEvent(flags.project, request)
    const result = response.data
    const human =
      result.delivery === 'generated'
        ? `Triggered ${result.event} ${String(result.eventId)} on ${result.session} (source: test).\n` +
          `A running \`polymorfa listen --project ${flags.project}\` prints it as: ${result.event} ${String(result.eventId)}`
        : `Sent a simulated message to ${result.session} from ${String(flags['from-session'])}.\n` +
          `The ${result.event} event arrives as Test number activity (source: runtime).`
    this.writeValue({data: result, metadata: response.metadata}, human, flags)
  }
}

/** Parse repeated key=value overrides. Numeric and boolean fields are typed. */
export function parseOverrides(values: readonly string[]): TestEventOverrides {
  const overrides: Record<string, unknown> = {}
  for (const value of values) {
    const separator = value.indexOf('=')
    if (separator <= 0)
      throw new PolymorfaConfigurationError(
        `Override "${value}" must use key=value.`,
        'override',
      )
    const key = value.slice(0, separator) as keyof TestEventOverrides
    const raw = value.slice(separator + 1)
    if (key in overrides)
      throw new PolymorfaConfigurationError(
        `Override "${key}" is set more than once.`,
        'override',
      )
    if (BOOLEAN_OVERRIDES.has(key)) {
      if (raw !== 'true' && raw !== 'false')
        throw new PolymorfaConfigurationError(
          `Override "${key}" must be true or false.`,
          'override',
        )
      overrides[key] = raw === 'true'
    } else if (INTEGER_OVERRIDES.has(key)) {
      if (!/^\d+$/.test(raw))
        throw new PolymorfaConfigurationError(
          `Override "${key}" must be a whole number.`,
          'override',
        )
      overrides[key] = Number(raw)
    } else {
      overrides[key] = raw
    }
  }
  return overrides
}
