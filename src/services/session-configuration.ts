import {
  PolymorfaConfigurationError,
  type UpdateSessionRequest,
} from '@polymorfa/sdk'

function invalid(path: string): never {
  throw new PolymorfaConfigurationError(
    `Invalid session configuration at ${path}.`,
    'input',
  )
}

function object(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path)
  const result = value as Record<string, unknown>
  if (Object.keys(result).some((key) => !keys.includes(key))) invalid(path)
  return result
}

const observationKeys = [
  'presenceMode',
  'typingMode',
  'labelMode',
  'quickReplyMode',
] as const
const resetPaths = [
  'historySync',
  'historySync.mode',
  'historySync.requestFull',
  'hms',
  'observation',
  ...observationKeys.map((key) => `observation.${key}`),
]

/** Validate the complete JSON boundary before constructing a client or sending a request. */
export function parseSessionConfigurationUpdate(
  input: unknown,
): UpdateSessionRequest {
  const body = object(input, ['revision', 'configuration'], 'input')
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0)
    invalid('revision')
  const patch = object(body.configuration, ['set', 'reset'], 'configuration')
  if (patch.set === undefined && patch.reset === undefined)
    invalid('configuration.set/reset')
  const set =
    patch.set === undefined
      ? {}
      : object(
          patch.set,
          ['historySync', 'hms', 'observation'],
          'configuration.set',
        )
  if (set.historySync !== undefined) {
    const history = object(
      set.historySync,
      ['mode', 'requestFull'],
      'configuration.set.historySync',
    )
    if (
      history.mode !== undefined &&
      (typeof history.mode !== 'string' ||
        !['metadata_only', 'deliver'].includes(history.mode))
    )
      invalid('historySync.mode')
    if (
      history.requestFull !== undefined &&
      typeof history.requestFull !== 'boolean'
    )
      invalid('historySync.requestFull')
  }
  if (set.observation !== undefined) {
    const observation = object(
      set.observation,
      observationKeys,
      'configuration.set.observation',
    )
    for (const [key, value] of Object.entries(observation)) {
      const modes =
        key === 'labelMode'
          ? ['off', 'events', 'cache', 'project']
          : ['off', 'events', 'cache']
      if (typeof value !== 'string' || !modes.includes(value))
        invalid(`observation.${key}`)
    }
  }
  if (set.hms !== undefined) {
    const hms = object(
      set.hms,
      [
        'enabled',
        'region',
        'policy',
        'retentionDays',
        'policyVersion',
        'legalHold',
      ],
      'configuration.set.hms',
    )
    if (hms.enabled === false) {
      if (Object.keys(hms).length !== 1) invalid('hms')
    } else if (hms.enabled === true) {
      if (
        typeof hms.region !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,31}$/.test(hms.region)
      )
        invalid('hms.region')
      const policies: Record<string, number> = {
        short: 7,
        standard: 30,
        extended: 90,
        compliance: 365,
      }
      if (
        typeof hms.policy !== 'string' ||
        ![...Object.keys(policies), 'enterprise_archive'].includes(hms.policy)
      )
        invalid('hms.policy')
      if (
        hms.retentionDays !== undefined &&
        (!Number.isSafeInteger(hms.retentionDays) ||
          Number(hms.retentionDays) < 1 ||
          Number(hms.retentionDays) > 2555)
      )
        invalid('hms.retentionDays')
      if (
        hms.policy === 'enterprise_archive'
          ? hms.retentionDays === undefined
          : hms.retentionDays !== undefined &&
            hms.retentionDays !== policies[hms.policy]
      )
        invalid('hms.retentionDays')
      if (
        hms.policyVersion !== undefined &&
        (typeof hms.policyVersion !== 'string' ||
          hms.policyVersion.length < 1 ||
          hms.policyVersion.length > 128)
      )
        invalid('hms.policyVersion')
      if (hms.legalHold !== undefined && typeof hms.legalHold !== 'boolean')
        invalid('hms.legalHold')
    } else invalid('hms.enabled')
  }
  if (patch.reset !== undefined) {
    if (!Array.isArray(patch.reset)) invalid('configuration.reset')
    for (const path of patch.reset) {
      if (typeof path !== 'string' || !resetPaths.includes(path))
        invalid('configuration.reset')
      const [group, field] = path.split('.')
      const value = set[group!]
      if (
        value !== undefined &&
        (field === undefined ||
          (value as Record<string, unknown>)[field] !== undefined)
      )
        invalid(`configuration.reset.${path}: also present in set`)
    }
  }
  return input as UpdateSessionRequest
}
