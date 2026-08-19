import {homedir} from 'node:os'
import {join} from 'node:path'

export interface ConfigDirectoryInput {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  readonly platform: NodeJS.Platform
}

export function resolveConfigDirectory(input: ConfigDirectoryInput): string {
  const explicit = nonEmpty(input.env.POLYMORFA_CONFIG_DIR)
  if (explicit !== undefined) return explicit

  if (input.platform === 'darwin') {
    return join(input.home, 'Library', 'Application Support', 'polymorfa')
  }

  if (input.platform === 'win32') {
    return join(nonEmpty(input.env.APPDATA) ?? input.home, 'polymorfa')
  }

  return join(
    nonEmpty(input.env.XDG_CONFIG_HOME) ?? join(input.home, '.config'),
    'polymorfa',
  )
}

export function defaultConfigDirectory(): string {
  return resolveConfigDirectory({
    env: process.env,
    home: homedir(),
    platform: process.platform,
  })
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
