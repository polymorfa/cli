// Injected as the global `process` in the browser build. The runtime swaps env and the writers per command.
// Process and its streams are emitters, so commands can add and remove listeners such as SIGINT.
import {EventEmitter} from './events.js'

const noop = (): void => {}

/** Standard output or error: an emitter whose writes succeed and call back, as Node's do once flushed. */
const stream = () =>
  Object.assign(new EventEmitter(), {
    write: (_chunk: unknown, ...rest: unknown[]): boolean => {
      const done = rest.find((value) => typeof value === 'function') as
        ((error?: Error | null) => void) | undefined
      if (done) queueMicrotask(() => done(null))
      return true
    },
    isTTY: false,
    columns: 100,
    end: noop,
  })

export const process = Object.assign(new EventEmitter(), {
  env: {},
  argv: ['node', 'polymorfa'],
  execArgv: [] as string[],
  execPath: '/usr/bin/node',
  title: 'polymorfa',
  platform: 'linux',
  arch: 'wasm',
  pid: 1,
  version: 'v22.0.0',
  versions: {node: '22.0.0'},
  release: {name: 'browser'},
  exitCode: undefined as number | undefined,
  stdout: stream(),
  stderr: stream(),
  stdin: {
    isTTY: false,
    on: noop,
    once: noop,
    off: noop,
    setRawMode: noop,
    resume: noop,
    pause: noop,
  },
  cwd: (): string => '/',
  chdir: noop,
  emitWarning: noop,
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]): void =>
    queueMicrotask(() => fn(...args)),
  hrtime: Object.assign(
    (previous?: [number, number]): [number, number] => {
      const now = performance.now()
      const seconds = Math.floor(now / 1000)
      const nanos = Math.floor((now % 1000) * 1e6)
      return previous
        ? [seconds - previous[0], nanos - previous[1]]
        : [seconds, nanos]
    },
    {bigint: (): bigint => BigInt(Math.floor(performance.now() * 1e6))},
  ),
  memoryUsage: (): {rss: number; heapUsed: number} => ({rss: 0, heapUsed: 0}),
  exit: (code?: number): never => {
    throw Object.assign(new Error(`EEXIT: ${code ?? 0}`), {
      oclif: {exit: code ?? 0},
    })
  },
  umask: (): number => 0o22,
  getuid: (): number => 1000,
})
