/**
 * The Polymorfa CLI in a browser: run a command from its words, with a
 * credential, fetch and output writer passed in. It runs the same command
 * classes as the installed CLI, so output, flags and errors match; anything
 * that needs files, the keychain, a terminal or a local server fails with a
 * message naming the installed CLI.
 */
import {COMMAND_LOADERS} from './registry.gen.js'

declare const __CLI_VERSION__: string | undefined
declare const __CLI_COMMIT__: string | undefined

export const CLI_VERSION =
  typeof __CLI_VERSION__ === 'string' ? __CLI_VERSION__ : '0.0.0-dev'
export const CLI_COMMIT =
  typeof __CLI_COMMIT__ === 'string' ? __CLI_COMMIT__ : 'unknown'
export const COMMAND_IDS: readonly string[] =
  Object.keys(COMMAND_LOADERS).sort()

export interface BrowserIo {
  /** Environment for the command: `POLYMORFA_PROJECT_TOKEN` or `POLYMORFA_API_KEY`, and optionally `POLYMORFA_BASE_URL`. */
  readonly env: Readonly<Record<string, string>>
  /**
   * The fetch the SDK uses for this command. While the command runs,
   * `globalThis.fetch` is this function, so it must call a fetch bound before
   * the command started, never `globalThis.fetch`.
   */
  readonly fetch: typeof fetch
  readonly write: (stream: 'stdout' | 'stderr', text: string) => void
}

export interface RunResult {
  readonly exitCode: number
  /** The command the words resolved to, or null when none matched. */
  readonly command: string | null
}

/** The longest command id the words start with, and the words after it. */
export function resolveCommand(
  words: readonly string[],
): {id: string; rest: string[]} | null {
  for (let length = Math.min(words.length, 4); length > 0; length--) {
    const id = words.slice(0, length).join(' ')
    if (id in COMMAND_LOADERS) return {id, rest: words.slice(length)}
  }
  return null
}

/** Split a command line into words the way a POSIX shell quotes them. */
export function splitWords(line: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!
    if (quote) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && index + 1 < line.length)
        current += line[++index]
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (char === '\\' && index + 1 < line.length) {
      current += line[++index]
      started = true
    } else if (/\s/.test(char)) {
      if (started) {
        words.push(current)
        current = ''
        started = false
      }
    } else {
      current += char
      started = true
    }
  }
  if (quote) throw new SyntaxError('Unclosed quote')
  if (started) words.push(current)
  return words
}

const config = {
  bin: 'polymorfa',
  name: '@polymorfa/cli',
  version: CLI_VERSION,
  userAgent: `@polymorfa/cli/${CLI_VERSION} browser`,
  pjson: {
    name: '@polymorfa/cli',
    version: CLI_VERSION,
    oclif: {bin: 'polymorfa', topicSeparator: ' '},
  },
  topicSeparator: ' ',
  platform: 'linux',
  arch: 'wasm',
  windows: false,
  shell: 'sh',
  debug: 0,
  root: '/',
  home: '/home/browser',
  configDir: '/home/browser/.config/polymorfa',
  dataDir: '/home/browser/.local/share/polymorfa',
  cacheDir: '/home/browser/.cache/polymorfa',
  runHook: () => Promise.resolve({failures: [], successes: []}),
  scopedEnvVar: () => undefined,
  scopedEnvVarKey: (key: string) => `POLYMORFA_${key}`,
  scopedEnvVarKeys: (key: string) => [`POLYMORFA_${key}`],
  findCommand: () => undefined,
  plugins: new Map(),
  commands: [],
  commandIDs: COMMAND_IDS,
}

interface ProcessLike {
  env: Record<string, string | undefined>
  exitCode?: number | string | undefined
  stdout: {write: (chunk: unknown) => boolean}
  stderr: {write: (chunk: unknown) => boolean}
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Run one command. Commands share the page's `process` and `fetch`, so only
 * one runs at a time: a command started while another runs waits for it.
 */
export function runCommand(
  words: readonly string[],
  io: BrowserIo,
): Promise<RunResult> {
  const result = queue.then(() => runNow(words, io))
  queue = result.catch(() => undefined)
  return result
}

async function runNow(
  words: readonly string[],
  io: BrowserIo,
): Promise<RunResult> {
  // The bare `process`: in the browser build it is the injected stand-in, under Node the real one.
  const proc = process as unknown as ProcessLike
  const saved = {
    env: proc.env,
    exitCode: proc.exitCode,
    out: proc.stdout.write,
    err: proc.stderr.write,
    fetch: globalThis.fetch,
  }
  proc.env = {...io.env}
  proc.exitCode = undefined
  proc.stdout.write = (chunk: unknown) => {
    io.write('stdout', String(chunk))
    return true
  }
  proc.stderr.write = (chunk: unknown) => {
    io.write('stderr', String(chunk))
    return true
  }
  globalThis.fetch = io.fetch
  const resolved = resolveCommand(words)
  try {
    if (!resolved) {
      io.write('stderr', `Unknown command: polymorfa ${words.join(' ')}\n`)
      return {exitCode: 2, command: null}
    }
    const module = await COMMAND_LOADERS[resolved.id]!()
    // Each module's default export is a concrete oclif command class.
    const CommandClass = module.default as {
      id?: string
      new (argv: string[], config: unknown): {_run: () => Promise<unknown>}
    }
    CommandClass.id = resolved.id
    const command = new CommandClass(resolved.rest, config)
    await command._run()
    const code = Number(proc.exitCode ?? 0)
    return {exitCode: Number.isFinite(code) ? code : 1, command: resolved.id}
  } catch (error) {
    const exit = (error as {oclif?: {exit?: unknown}}).oclif?.exit
    if (typeof exit === 'number')
      return {exitCode: exit, command: resolved?.id ?? null}
    const debug =
      io.env.POLYMORFA_BROWSER_DEBUG === '1' && error instanceof Error
        ? `\n${error.stack ?? ''}`
        : ''
    io.write(
      'stderr',
      `${error instanceof Error ? error.message : String(error)}${debug}\n`,
    )
    return {exitCode: 1, command: resolved?.id ?? null}
  } finally {
    proc.env = saved.env
    proc.exitCode = saved.exitCode
    proc.stdout.write = saved.out
    proc.stderr.write = saved.err
    globalThis.fetch = saved.fetch
  }
}
