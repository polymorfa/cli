import {spawn} from 'node:child_process'
import {access, stat} from 'node:fs/promises'
import {constants} from 'node:fs'
import {homedir} from 'node:os'
import {delimiter, join} from 'node:path'

export const AGENT_KIT = {
  repository: 'https://github.com/polymorfa/agent-kit',
  marketplaceSource: 'polymorfa/agent-kit',
  marketplace: 'polymorfa',
  plugin: 'polymorfa',
} as const
export const CLIENTS = ['claude', 'codex', 'gemini', 'cursor'] as const
export type AgentClient = (typeof CLIENTS)[number]
export interface ProcessResult {
  code: number
  stdout: string
}
export type ProcessRunner = (
  binary: string,
  args: readonly string[],
) => Promise<ProcessResult>

/** Never forward child output: a client may include private local configuration. */
export const runProcess: ProcessRunner = (binary, args) =>
  new Promise((resolve) => {
    const windows = process.platform === 'win32'
    // Every caller uses fixed client names and installer tokens. Refuse shell
    // syntax here rather than turning a future argument into executable text.
    if (
      windows &&
      [binary, ...args].some((token) => !/^[a-z0-9_.:@/=-]+$/i.test(token))
    ) {
      resolve({code: 1, stdout: ''})
      return
    }
    const child = windows
      ? spawn([binary, ...args].join(' '), {
          shell: true,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 120_000,
        })
      : spawn(binary, [...args], {
          shell: false,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 120_000,
        })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      // Bound metadata/help output retained in memory.
      if (stdout.length + chunk.length <= 1024 * 1024) stdout += chunk
      else child.kill()
    })
    child.on('error', () => resolve({code: 1, stdout: ''}))
    child.on('close', (code) => resolve({code: code ?? 1, stdout}))
  })

export async function binaryExists(binary: string): Promise<boolean> {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue
    for (const suffix of process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
      : ['']) {
      try {
        const path = join(directory, `${binary}${suffix}`)
        await access(path, constants.X_OK)
        if ((await stat(path)).isFile()) return true
      } catch {
        // Continue through PATH without reading files.
      }
    }
  }
  return false
}

export async function cursorConfigExists(): Promise<boolean> {
  try {
    return (await stat(join(homedir(), '.cursor'))).isDirectory()
  } catch {
    return false
  }
}

export async function detectClients(
  exists = binaryExists,
  cursorConfig = cursorConfigExists,
): Promise<AgentClient[]> {
  const found: AgentClient[] = []
  for (const client of CLIENTS) {
    if (
      (await exists(client)) ||
      (client === 'cursor' && (await cursorConfig()))
    )
      found.push(client)
  }
  return found
}

type Invocation = readonly string[]
export interface SetupResult {
  client: AgentClient
  status:
    'installed' | 'already installed' | 'dry-run' | 'instructions' | 'failed'
}
export interface SetupOptions {
  clients: readonly AgentClient[]
  dryRun: boolean
  yes: boolean
  log: (message: string) => void
  confirm: () => Promise<boolean>
  runner?: ProcessRunner
  exists?: typeof binaryExists
  cursorConfig?: typeof cursorConfigExists
}

const selector = `${AGENT_KIT.plugin}@${AGENT_KIT.marketplace}`

/** Inspect only identity fields from a client's installed-plugin listing. */
function installedPlugin(stdout: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stdout)
    const entries = Array.isArray(parsed)
      ? (parsed as unknown[])
      : typeof parsed === 'object' && parsed !== null && 'installed' in parsed
        ? parsed.installed
        : []
    return (
      Array.isArray(entries) &&
      entries.some((entry) => {
        if (typeof entry !== 'object' || entry === null) return false
        const item = entry as Record<string, unknown>
        return (
          item.id === selector ||
          (item.name === AGENT_KIT.plugin &&
            item.marketplaceName === AGENT_KIT.marketplace)
        )
      })
    )
  } catch {
    return false
  }
}

function marketplaceExists(stdout: string): boolean {
  const parsed: unknown = JSON.parse(stdout)
  const entries = Array.isArray(parsed)
    ? (parsed as unknown[])
    : typeof parsed === 'object' && parsed !== null && 'marketplaces' in parsed
      ? parsed.marketplaces
      : undefined
  if (!Array.isArray(entries)) throw new Error('Unknown marketplace listing')
  const existing: unknown = entries.find(
    (entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      entry.name === AGENT_KIT.marketplace,
  )
  if (existing === undefined) return false
  const entry = existing as Record<string, unknown>
  const source = entry.source ?? entry.marketplaceSource
  const metadata =
    typeof source === 'object' && source !== null
      ? (source as Record<string, unknown>)
      : typeof source === 'string'
        ? entry
        : undefined
  if (metadata === undefined) throw new Error('Unknown marketplace source')
  const repository = metadata.repo ?? metadata.url ?? metadata.source
  if (
    ![
      AGENT_KIT.marketplaceSource,
      AGENT_KIT.repository,
      `${AGENT_KIT.repository}.git`,
    ].includes(repository as string)
  )
    throw new Error('Marketplace name belongs to another source')
  return true
}

export async function setupAgents(
  options: SetupOptions,
): Promise<SetupResult[]> {
  const runner = options.runner ?? runProcess
  const exists = options.exists ?? binaryExists
  const results: SetupResult[] = []
  let consent: boolean | undefined = options.yes ? true : undefined
  for (const client of [...new Set(options.clients)]) {
    try {
      if (client === 'cursor') {
        if (
          !(await exists(client)) &&
          !(await (options.cursorConfig ?? cursorConfigExists)())
        )
          throw new Error('unavailable')
        options.log(
          `cursor: instructions. Install Polymorfa from the Cursor marketplace or ${AGENT_KIT.repository}.`,
        )
        results.push({client, status: 'instructions'})
        continue
      }
      if (!(await exists(client))) throw new Error('unavailable')
      let commands: Invocation[]
      if (client === 'codex') {
        const help = await runner(client, ['--help'])
        const pluginHelp = await runner(client, ['plugin', '--help'])
        const addHelp = await runner(client, ['plugin', 'add', '--help'])
        const marketplaceHelp = await runner(client, [
          'plugin',
          'marketplace',
          'add',
          '--help',
        ])
        if (
          help.code !== 0 ||
          !/\bplugin\b/.test(help.stdout) ||
          pluginHelp.code !== 0 ||
          !/\badd\b/.test(pluginHelp.stdout) ||
          addHelp.code !== 0 ||
          !addHelp.stdout.includes('PLUGIN') ||
          marketplaceHelp.code !== 0 ||
          !/Git|git/.test(marketplaceHelp.stdout)
        ) {
          options.log(
            `codex: instructions. This CLI does not advertise Git marketplace installation. Follow ${AGENT_KIT.repository} for documented skill installation; no configuration was changed.`,
          )
          results.push({client, status: 'instructions'})
          continue
        }
        commands = [
          ['plugin', 'marketplace', 'add', AGENT_KIT.marketplaceSource],
          ['plugin', 'add', selector],
        ]
      } else if (client === 'claude') {
        commands = [
          ['plugin', 'marketplace', 'add', AGENT_KIT.marketplaceSource],
          ['plugin', 'install', selector],
        ]
      } else {
        commands = [
          ['extensions', 'install', AGENT_KIT.repository, '--consent'],
        ]
      }
      if (options.dryRun) {
        for (const args of commands) options.log(`${client} ${args.join(' ')}`)
        options.log(`${client}: dry-run (no installation performed).`)
        results.push({client, status: 'dry-run'})
        continue
      }
      if (client === 'claude' || client === 'codex') {
        const installed = await runner(client, ['plugin', 'list', '--json'])
        if (installed.code !== 0) throw new Error('listing failed')
        if (installedPlugin(installed.stdout)) {
          options.log(`${client}: already installed.`)
          results.push({client, status: 'already installed'})
          continue
        }
        const marketplaces = await runner(client, [
          'plugin',
          'marketplace',
          'list',
          '--json',
        ])
        if (marketplaces.code !== 0) throw new Error('listing failed')
        if (marketplaceExists(marketplaces.stdout)) commands = commands.slice(1)
      } else {
        const installed = await runner(client, ['extensions', 'list'])
        if (installed.code !== 0) throw new Error('listing failed')
        if (/^\s*(?:[✓✔*]\s*)?polymorfa\s+\(/m.test(installed.stdout)) {
          options.log(`${client}: already installed.`)
          results.push({client, status: 'already installed'})
          continue
        }
      }
      // Ask once, only when a client is ready to mutate state.
      consent ??= await options.confirm()
      if (!consent) {
        options.log(
          `${client}: failed (installation was not confirmed; use --yes in automation).`,
        )
        results.push({client, status: 'failed'})
        continue
      }
      for (const args of commands) {
        if ((await runner(client, args)).code !== 0)
          throw new Error('install failed')
      }
      options.log(`${client}: installed.`)
      results.push({client, status: 'installed'})
    } catch {
      // Never include exceptions or subprocess output, which may contain secrets.
      options.log(
        `${client}: failed. Check that the client is installed and supports the agent-kit installer. Client output was withheld.`,
      )
      results.push({client, status: 'failed'})
    }
  }
  return results
}
