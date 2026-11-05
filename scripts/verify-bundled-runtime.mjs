import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {log} from 'node:console'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {basename, dirname, isAbsolute, join, relative, sep} from 'node:path'
import process from 'node:process'
import {fileURLToPath, URL} from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const expected = manifest.overrides?.['@oclif/core']?.minimatch
assert.equal(manifest.name, '@polymorfa/cli')
assert.equal(expected, '11.0.4')
assert.ok(manifest.bundleDependencies?.includes('@oclif/core'))
assert.ok(
  process.env.npm_execpath,
  'Run through npm run verify:bundled-runtime',
)

const temporary = mkdtempSync(join(tmpdir(), 'polymorfa-bundled-runtime-'))
const childEnvironment = {...process.env}
for (const key of Object.keys(childEnvironment)) {
  if (
    /^npm_config_/i.test(key) ||
    key.startsWith('POLYMORFA_') ||
    ['NODE_AUTH_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'].includes(key)
  ) {
    delete childEnvironment[key]
  }
}
const emptyUserConfig = join(temporary, 'empty-user.npmrc')
const emptyGlobalConfig = join(temporary, 'empty-global.npmrc')
writeFileSync(emptyUserConfig, '', {mode: 0o600})
writeFileSync(emptyGlobalConfig, '', {mode: 0o600})

/** Run npm with isolated configuration and cache, without inherited credentials. */
function npm(args, cwd) {
  return execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      ...args,
      `--userconfig=${emptyUserConfig}`,
      `--globalconfig=${emptyGlobalConfig}`,
      `--cache=${join(temporary, 'npm-cache')}`,
      '--registry=https://registry.npmjs.org',
    ],
    {cwd, env: childEnvironment, encoding: 'utf8'},
  )
}

/** Reject dependency resolutions outside the canonical installed-package root. */
function inside(path, directory) {
  const location = relative(realpathSync(directory), realpathSync(path))
  assert.ok(
    location !== '..' &&
      !location.startsWith(`..${sep}`) &&
      !isAbsolute(location),
    'Runtime dependency must resolve inside the isolated installed CLI',
  )
}

/** Find the named package manifest without walking outside its allowed root. */
function packageFor(entry, name, installedCli) {
  inside(entry, installedCli)
  let directory = dirname(entry)
  while (true) {
    inside(directory, installedCli)
    const file = join(directory, 'package.json')
    if (existsSync(file)) {
      const metadata = JSON.parse(readFileSync(file, 'utf8'))
      if (metadata.name === name) return {file, metadata}
    }
    directory = dirname(directory)
  }
}

try {
  const [packed] = JSON.parse(
    npm(
      ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary],
      root,
    ),
  )
  assert.equal(basename(packed.filename), packed.filename)
  const archive = join(temporary, packed.filename)
  writeFileSync(
    join(temporary, 'package.json'),
    JSON.stringify({
      name: 'polymorfa-runtime-consumer',
      version: '0.0.0',
      private: true,
    }),
  )
  npm(['install', '--ignore-scripts', '--omit=dev', archive], temporary)

  const installedCli = join(temporary, 'node_modules', '@polymorfa', 'cli')
  const fromCli = createRequire(join(installedCli, 'package.json'))
  const coreEntry = fromCli.resolve('@oclif/core')
  const core = packageFor(coreEntry, '@oclif/core', installedCli)
  const matcherEntry = createRequire(coreEntry).resolve('minimatch')
  const matcher = packageFor(matcherEntry, 'minimatch', installedCli)
  assert.equal(matcher.metadata.version, expected)

  const bundledPath = `package/${relative(realpathSync(installedCli), realpathSync(matcher.file)).split(sep).join('/')}`
  const archivedMatcher = JSON.parse(
    execFileSync('tar', ['-xzOf', archive, bundledPath], {encoding: 'utf8'}),
  )
  assert.equal(archivedMatcher.version, expected)
  const installed = JSON.parse(
    readFileSync(join(installedCli, 'package.json'), 'utf8'),
  )
  const installedSdk = packageFor(
    fileURLToPath(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          'process.stdout.write(import.meta.resolve("@polymorfa/sdk"))',
        ],
        {cwd: installedCli, env: childEnvironment, encoding: 'utf8'},
      ),
    ),
    '@polymorfa/sdk',
    join(temporary, 'node_modules'),
  )
  assert.equal(
    installedSdk.metadata.version,
    manifest.dependencies['@polymorfa/sdk'],
  )
  assert.equal(installed.version, manifest.version)
  assert.equal(
    installed.dependencies['@polymorfa/sdk'],
    manifest.dependencies['@polymorfa/sdk'],
  )
  const version = execFileSync(
    process.execPath,
    [join(installedCli, 'bin/run.js'), '--version'],
    {
      cwd: temporary,
      env: childEnvironment,
      encoding: 'utf8',
    },
  )
  assert.ok(version.includes(manifest.version))
  npm(['audit', '--omit=dev'], temporary)
  log(
    JSON.stringify({
      packedRuntime: '@oclif/core',
      frameworkVersion: core.metadata.version,
      patchedMatcherVersion: matcher.metadata.version,
      installedCliVersion: installed.version,
      sdkVersion: installedSdk.metadata.version,
      consumerAudit: 'passed',
    }),
  )
} finally {
  rmSync(temporary, {recursive: true, force: true})
}
