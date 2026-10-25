// Injected as the global `process` in the browser build. The runtime swaps env and the writers per command.
const noop = (): void => {}
const stream = (): {
  write: (chunk: unknown) => boolean
  isTTY: boolean
  columns: number
  on: typeof noop
  once: typeof noop
  off: typeof noop
  end: typeof noop
} => ({
  write: () => true,
  isTTY: false,
  columns: 100,
  on: noop,
  once: noop,
  off: noop,
  end: noop,
})

export const process = {
  env: {} as Record<string, string | undefined>,
  argv: ['node', 'polymorfa'],
  execArgv: [] as string[],
  execPath: '/usr/bin/node',
  title: 'polymorfa',
  platform: 'linux',
  arch: 'wasm',
  pid: 1,
  version: 'v22.0.0',
  versions: {node: '22.0.0'} as Record<string, string>,
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
  on: noop,
  once: noop,
  off: noop,
  removeListener: noop,
  listeners: (): unknown[] => [],
  emit: (): boolean => false,
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
}
