// Builds dist-browser/: the CLI's commands as a browser module (src/browser/index.ts).
// Node built-ins and local-only packages resolve to src/browser/stubs; each command loads on demand.
import console from 'node:console'
import process from 'node:process'
import {URL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {readFileSync, writeFileSync, rmSync} from 'node:fs'
import {builtinModules} from 'node:module'
import {build} from 'esbuild'

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const stub = (name) =>
  new URL(`../src/browser/stubs/${name}.ts`, import.meta.url).pathname
const NODE = {
  fs: stub('fs'),
  'fs/promises': stub('fs-promises'),
  path: stub('path'),
  'path/posix': stub('path'),
  os: stub('os'),
  crypto: stub('crypto'),
  events: stub('events'),
  buffer: stub('buffer'),
  child_process: stub('unavailable'),
  net: stub('unavailable'),
  dns: stub('unavailable'),
  'dns/promises': stub('unavailable'),
  http: stub('unavailable'),
  https: stub('unavailable'),
  readline: stub('unavailable'),
  'readline/promises': stub('unavailable'),
}
const PACKAGES = new Set([
  '@napi-rs/keyring',
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/server/stdio',
  'jq-wasm',
  '@polymorfa/sdk/node',
])
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const builtins = new RegExp(`^(${builtinModules.map(escape).join('|')})$`)

const stubs = {
  name: 'browser-stubs',
  setup(builder) {
    builder.onResolve({filter: /^node:/}, (args) => ({
      path: NODE[args.path.slice(5)] ?? stub('misc'),
    }))
    builder.onResolve({filter: builtins}, (args) => ({
      path: NODE[args.path] ?? stub('misc'),
    }))
    builder.onResolve(
      {
        filter:
          /^(@napi-rs\/keyring|@modelcontextprotocol\/server(\/stdio)?|jq-wasm|@polymorfa\/sdk\/node)$/,
      },
      (args) =>
        PACKAGES.has(args.path) ? {path: stub('packages')} : undefined,
    )
  },
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
rmSync(new URL('../dist-browser', import.meta.url), {
  recursive: true,
  force: true,
})
const result = await build({
  entryPoints: ['src/browser/index.ts'],
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outdir: 'dist-browser',
  entryNames: 'polymorfa-cli',
  chunkNames: 'chunks/[name]-[hash]',
  inject: [stub('process'), stub('buffer-global')],
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __CLI_COMMIT__: JSON.stringify(commit),
    global: 'globalThis',
  },
  plugins: [stubs],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  minify: process.env.BROWSER_MINIFY !== '0',
  legalComments: 'linked',
  metafile: true,
  logLevel: 'warning',
})
const bytes = Object.values(result.metafile.outputs).reduce(
  (sum, output) => sum + output.bytes,
  0,
)
writeFileSync(
  new URL('../dist-browser/manifest.json', import.meta.url),
  `${JSON.stringify({package: pkg.name, version: pkg.version, commit, entry: 'polymorfa-cli.js', files: Object.keys(result.metafile.outputs).length, bytes}, null, 2)}\n`,
)
console.log(
  `dist-browser: ${Object.keys(result.metafile.outputs).length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB, commit ${commit.slice(0, 10)}`,
)
