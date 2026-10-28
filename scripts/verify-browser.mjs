// Build through the real producers and inspect/run the actual emitted module.
import assert from 'node:assert/strict'
import process from 'node:process'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {builtinModules} from 'node:module'
import {URL, pathToFileURL} from 'node:url'
import console from 'node:console'
const root = join(
  homedir(),
  '.polymorfa-agent-work',
  'cli-browser-artifact-checks',
)
mkdirSync(root, {recursive: true})
const work = mkdtempSync(join(root, 'check-'))
const metaPath = join(work, 'metafile.json')
execFileSync(process.execPath, ['scripts/gen-browser-registry.mjs'], {
  stdio: 'inherit',
})
execFileSync(process.execPath, ['scripts/build-browser.mjs'], {
  stdio: 'inherit',
  env: {...process.env, BROWSER_METAFILE: metaPath},
})
const metadata = JSON.parse(readFileSync(metaPath, 'utf8'))
const inputs = Object.keys(metadata.inputs).map((path) =>
  path.replaceAll('\\', '/'),
)
for (const local of [
  'src/commands/agent/setup.ts',
  'src/services/agent-setup.ts',
])
  assert.ok(
    !inputs.some((path) => path.endsWith(local)),
    local + ' was bundled',
  )
for (const nativePackage of [
  'node_modules/@napi-rs/keyring/',
  'node_modules/@modelcontextprotocol/server/',
])
  assert.ok(
    !inputs.some((path) => path.includes(nativePackage)),
    nativePackage + ' was bundled',
  )
const nativeBuiltins = new Set(
  builtinModules.map((value) => value.replace(/^node:/, '')),
)
for (const output of Object.values(metadata.outputs))
  for (const item of output.imports)
    assert.ok(
      !(
        item.external &&
        (item.path.startsWith('node:') || nativeBuiltins.has(item.path))
      ),
      'Native Node import escaped browser stubbing: ' + item.path,
    )
const manifest = JSON.parse(readFileSync('dist-browser/manifest.json', 'utf8'))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
assert.equal(manifest.commit, commit)
const actual = await import(
  pathToFileURL(join(process.cwd(), 'dist-browser/polymorfa-cli.js')).href
)
assert.equal(actual.CLI_COMMIT, commit)
assert.ok(actual.COMMAND_IDS.includes('agent setup'))
const beforeFetch = globalThis.fetch
const refused = []
const refusal = await actual.runCommand(['agent', 'setup', '--yes'], {
  get env() {
    throw new Error('local refusal touched caller credentials/configuration')
  },
  get fetch() {
    throw new Error('local refusal touched fetch')
  },
  write: (stream, text) => refused.push({stream, text}),
})
assert.deepEqual(refusal, {exitCode: 1, command: 'agent setup'})
assert.ok(
  refused.some(
    (value) =>
      value.stream === 'stderr' &&
      value.text.includes('configures coding agents'),
  ),
)
assert.equal(globalThis.fetch, beforeFetch)
const requests = []
const output = []
const sent = await actual.runCommand(
  [
    'message',
    'send',
    'text',
    '--session',
    '739182640518203',
    '--to',
    '+15550002222',
    '--body',
    'Hello from Polymorfa',
  ],
  {
    env: {POLYMORFA_CLIENT_TOKEN: 'pmfa_ct_' + 'fixture'.repeat(6)},
    fetch: async (input, init = {}) => {
      requests.push({
        path: new URL(String(input)).pathname,
        method: init.method,
        body: JSON.parse(init.body),
      })
      return new globalThis.Response(
        JSON.stringify({
          success: true,
          data: {id: '3EB0FIXTURE', status: 'sent'},
        }),
        {status: 200, headers: {'content-type': 'application/json'}},
      )
    },
    write: (stream, text) => output.push({stream, text}),
  },
)
assert.deepEqual(sent, {exitCode: 0, command: 'message send text'})
assert.equal(requests.length, 1)
assert.equal(requests[0].method, 'POST')
assert.equal(requests[0].path, '/messaging/739182640518203/messages/send')
assert.equal(requests[0].body.content.text, 'Hello from Polymorfa')
assert.equal(
  output
    .filter((value) => value.stream === 'stdout')
    .map((value) => value.text)
    .join(''),
  'Sent message 3EB0FIXTURE to +15550002222.\n',
)
assert.equal(globalThis.fetch, beforeFetch)
console.log(
  JSON.stringify({
    commit,
    commands: actual.COMMAND_IDS.length,
    localInstallerBundled: false,
    agentSetup: 'refused before environment/fetch',
    send: {method: requests[0].method, path: requests[0].path},
    files: manifest.files,
    bytes: manifest.bytes,
    evidence: work,
  }),
)
