import {lstat, mkdir, open, rmdir, unlink} from 'node:fs/promises'
import {join, resolve} from 'node:path'

const FILE_NAMES = [
  'package.json',
  '.env.example',
  'README.md',
  'src/index.ts',
] as const

export const STARTER_SDK_VERSION = '0.1.0-dev.20260926224018'

export interface InitResult {
  directory: string
  files: readonly string[]
  sdkVersion: string
}

export async function initStarter(directory: string): Promise<InitResult> {
  const root = resolve(directory)
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory())
    throw new Error(`Starter target is not a directory: ${root}`)

  // Refuse a partial starter before creating anything. In particular, an
  // existing src directory is not ours to populate, even if it looks empty.
  for (const name of [...FILE_NAMES.slice(0, 3), 'src']) {
    if (await exists(join(root, name)))
      throw new Error(`Starter target already exists: ${join(root, name)}`)
  }

  const files = starterFiles(STARTER_SDK_VERSION)
  const created: string[] = []
  let madeSourceDirectory = false
  try {
    await mkdir(join(root, 'src'))
    madeSourceDirectory = true
    for (const name of FILE_NAMES) {
      const path = join(root, name)
      const handle = await open(path, 'wx', 0o644)
      created.push(path)
      try {
        await handle.writeFile(files[name], 'utf8')
      } finally {
        await handle.close()
      }
    }
  } catch (error) {
    for (const path of created.reverse())
      await unlink(path).catch(() => undefined)
    if (madeSourceDirectory)
      await rmdir(join(root, 'src')).catch(() => undefined)
    throw error
  }

  return {directory: root, files: FILE_NAMES, sdkVersion: STARTER_SDK_VERSION}
}

function starterFiles(
  sdkVersion: string,
): Record<(typeof FILE_NAMES)[number], string> {
  const manifest = {
    name: 'polymorfa-starter',
    private: true,
    type: 'module',
    engines: {node: '>=22'},
    scripts: {
      start: 'tsx src/index.ts',
      typecheck:
        'tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --types node src/index.ts',
    },
    dependencies: {'@polymorfa/sdk': sdkVersion},
    devDependencies: {
      '@types/node': '22.20.4',
      tsx: '4.20.6',
      typescript: '6.0.3',
    },
  }

  return {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    '.env.example': 'POLYMORFA_API_KEY=\n',
    'README.md': `# Polymorfa Node starter

This example lists projects using the Polymorfa TypeScript SDK. It needs Node.js 22 or later and a team API key with permission to list projects. No credential is included in these files.

1. Run \`npm install\` and commit the generated lockfile.
2. Set \`POLYMORFA_API_KEY\` in your shell or secret manager. \`.env.example\` lists the required variable but contains no value.
3. Run \`npm run typecheck\`, then \`npm start\`.

The SDK dependency is pinned to an exact published development version. To select a project for separate CLI commands, run \`polymorfa link\` after creating a project; \`init\` does not link a project.
`,
    'src/index.ts': `import {Client} from '@polymorfa/sdk'

const apiKey = process.env.POLYMORFA_API_KEY
if (!apiKey) {
  console.error('Set POLYMORFA_API_KEY in your shell or secret manager.')
  process.exitCode = 1
} else {
  const client = new Client({
    credential: {type: 'organizationApiKey', value: apiKey},
  })
  const response = await client.projects.list()
  for (const project of response.data.data) {
    console.log(project._id, project.slug)
  }
}
`,
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
