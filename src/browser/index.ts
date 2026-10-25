/**
 * The Polymorfa CLI in a browser: run a command from its words, with a
 * credential, fetch and output writer passed in. It runs the same command
 * classes as the installed CLI, so output, flags and errors match; anything
 * that needs files, the keychain, a terminal or a local server fails with a
 * message naming the installed CLI.
 */
import {COMMAND_LOADERS} from './registry.gen.js'
import {BrowserUnsupportedError} from './stubs/unsupported.js'

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
  /** Receives the command's output. Byte chunks arrive decoded as UTF-8. */
  readonly write: (stream: 'stdout' | 'stderr', text: string) => void
  /**
   * Stops a running command the way Ctrl-C does: aborting it calls the
   * `SIGINT` listeners the command registered, which is how following
   * commands such as `logs tail` and `event stream` stop. The next command
   * starts only after this one has returned.
   */
  readonly signal?: AbortSignal
}

/** Commands whose output the browser cannot show, with the reason. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
  'calls media': 'streams call audio as binary PCM',
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
    if (Object.hasOwn(COMMAND_LOADERS, id))
      return {id, rest: words.slice(length)}
  }
  return null
}

// Inside double quotes a POSIX shell treats a backslash as an escape only
// before these characters; elsewhere it is literal, so `"C:\new"` keeps it.
const DOUBLE_QUOTE_ESCAPES = new Set(['$', '`', '"', '\\', '\n'])

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
      else if (
        char === '\\' &&
        quote === '"' &&
        DOUBLE_QUOTE_ESCAPES.has(line[index + 1] ?? '')
      )
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

type Listener = (...args: unknown[]) => void
type WriteCallback = (error?: Error | null) => void

interface EmitterLike {
  listeners: (event: string) => Listener[]
  on: (event: string, listener: Listener) => unknown
  removeListener: (event: string, listener: Listener) => unknown
}

interface StreamLike extends EmitterLike {
  write: (chunk: unknown, ...rest: unknown[]) => boolean
}

interface ProcessLike extends EmitterLike {
  env: Record<string, string | undefined>
  exitCode?: number | string | undefined
  stdout: StreamLike
  stderr: StreamLike
}

const utf8 = new TextDecoder('utf-8', {fatal: true})

/** A chunk as text. Bytes must be UTF-8; anything else needs a real terminal. */
function textOf(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (chunk instanceof Uint8Array) {
    try {
      return utf8.decode(chunk)
    } catch {
      throw new BrowserUnsupportedError('writes binary data to its output')
    }
  }
  return String(chunk)
}

/**
 * A stream `write` that hands text to the page and calls the write callback,
 * as Node does once a chunk is flushed. Commands such as `listen` wait for it.
 */
function writer(io: BrowserIo, stream: 'stdout' | 'stderr') {
  return (chunk: unknown, ...rest: unknown[]): boolean => {
    io.write(stream, textOf(chunk))
    const done = rest.find(
      (value): value is WriteCallback => typeof value === 'function',
    )
    if (done) queueMicrotask(() => done(null))
    return true
  }
}

/** Listeners a command may leave on the shared process and its streams. */
function trackedListeners(proc: ProcessLike): [EmitterLike, string][] {
  return [
    [proc, 'SIGINT'],
    [proc, 'SIGTERM'],
    [proc.stdout, 'error'],
    [proc.stdout, 'drain'],
    [proc.stderr, 'error'],
  ]
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
  const resolved = resolveCommand(words)
  if (!resolved) {
    io.write('stderr', `Unknown command: polymorfa ${words.join(' ')}\n`)
    return {exitCode: 2, command: null}
  }
  const unsupported = UNSUPPORTED[resolved.id]
  if (unsupported) {
    io.write('stderr', `${new BrowserUnsupportedError(unsupported).message}\n`)
    return {exitCode: 1, command: resolved.id}
  }
  // Interrupted before it started, as a terminal reports Ctrl-C.
  if (io.signal?.aborted) return {exitCode: 130, command: resolved.id}
  // The bare `process`: in the browser build it is the injected stand-in, under Node the real one.
  const proc = process as unknown as ProcessLike
  const tracked = trackedListeners(proc)
  const before = tracked.map(([emitter, event]) => emitter.listeners(event))
  const saved = {
    env: proc.env,
    exitCode: proc.exitCode,
    out: proc.stdout.write,
    err: proc.stderr.write,
    fetch: globalThis.fetch,
  }
  // Only the listeners this command added: a host process's own stay untouched.
  const added = (index: number): Listener[] => {
    const [emitter, event] = tracked[index]!
    return emitter
      .listeners(event)
      .filter((listener) => !before[index]!.includes(listener))
  }
  // An abort before the command registers its SIGINT listener still reaches
  // it: the listener is called as soon as the command adds it.
  let interrupted = false
  const interrupt = () => {
    interrupted = true
    for (const listener of added(0)) listener('SIGINT')
  }
  const lateListener = (event: unknown, listener: unknown) => {
    if (interrupted && event === 'SIGINT' && typeof listener === 'function')
      queueMicrotask(() => (listener as Listener)('SIGINT'))
  }
  proc.env = {...io.env}
  proc.exitCode = undefined
  proc.stdout.write = writer(io, 'stdout')
  proc.stderr.write = writer(io, 'stderr')
  globalThis.fetch = io.fetch
  io.signal?.addEventListener('abort', interrupt)
  proc.on('newListener', lateListener)
  try {
    const module = await COMMAND_LOADERS[resolved.id]!()
    // Interrupted while its code loaded: it never starts.
    if (interrupted || io.signal?.aborted)
      return {exitCode: 130, command: resolved.id}
    // Each module's default export is a concrete oclif command class.
    const CommandClass = module.default as {
      id?: string
      new (argv: string[], config: unknown): {_run: () => Promise<unknown>}
    }
    CommandClass.id = resolved.id
    const command = new CommandClass(resolved.rest, config)
    // The shared state is restored only after the command returns, even when
    // interrupted, so it never runs against the next command's globals.
    await command._run()
    const code = Number(proc.exitCode ?? 0)
    return {exitCode: Number.isFinite(code) ? code : 1, command: resolved.id}
  } catch (error) {
    const exit = (error as {oclif?: {exit?: unknown}}).oclif?.exit
    if (typeof exit === 'number') return {exitCode: exit, command: resolved.id}
    const debug =
      io.env.POLYMORFA_BROWSER_DEBUG === '1' && error instanceof Error
        ? `\n${error.stack ?? ''}`
        : ''
    io.write(
      'stderr',
      `${error instanceof Error ? error.message : String(error)}${debug}\n`,
    )
    return {exitCode: 1, command: resolved.id}
  } finally {
    io.signal?.removeEventListener('abort', interrupt)
    proc.removeListener('newListener', lateListener)
    tracked.forEach(([emitter, event], index) => {
      for (const listener of added(index))
        emitter.removeListener(event, listener)
    })
    proc.env = saved.env
    proc.exitCode = saved.exitCode
    proc.stdout.write = saved.out
    proc.stderr.write = saved.err
    globalThis.fetch = saved.fetch
  }
}
