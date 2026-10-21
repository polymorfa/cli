import {Plugin} from '@oclif/core'
import {format, resolveConfig} from 'prettier'
import {readFile, writeFile} from 'node:fs/promises'
import {fileURLToPath, URL} from 'node:url'
import process from 'node:process'
import console from 'node:console'
import {resolve} from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = new URL('../contracts/cli-reference.json', import.meta.url)
const words = (id) => id.replaceAll(':', ' ')
const render = (value, id) =>
  String(value ?? '')
    .replaceAll('<%= config.bin %>', 'polymorfa')
    .replaceAll('<%= command.id %>', words(id))
const byName = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)

export function referenceFromManifest(manifest) {
  return {
    schemaVersion: 1,
    cliVersion: manifest.version,
    commands: Object.entries(manifest.commands)
      .sort(byName)
      .filter(([, command]) => !command.hidden)
      .map(([id, command]) => {
        const renderCommand = (value) => render(value, id)
        const args = Object.entries(command.args ?? {}).filter(
          ([, arg]) => !arg.hidden,
        )
        const flags = Object.entries(command.flags ?? {})
          .sort(byName)
          .filter(([, flag]) => !flag.hidden)
        const usage =
          command.usage ??
          [
            `polymorfa ${words(id)}`,
            ...args.map(([name, arg]) =>
              arg.required ? name.toUpperCase() : `[${name.toUpperCase()}]`,
            ),
            ...(flags.length ? ['[flags]'] : []),
          ].join(' ')
        return {
          id: words(id),
          summary: renderCommand(
            command.summary ?? command.description?.split('\n')[0],
          ),
          description: renderCommand(command.description),
          usage: (Array.isArray(usage) ? usage : [usage]).map(renderCommand),
          aliases: [...(command.aliases ?? [])]
            .filter((alias) => !(command.hiddenAliases ?? []).includes(alias))
            .map(words)
            .sort(),
          hidden: false,
          args: args.map(([name, arg]) => ({
            name,
            description: renderCommand(arg.description),
            required: arg.required ?? false,
            options: arg.options ?? [],
          })),
          flags: flags.map(([name, flag]) => ({
            name,
            char: flag.char ?? null,
            type: flag.type,
            required: flag.required ?? false,
            multiple: flag.multiple ?? false,
            default: flag.default ?? null,
            options: flag.options ?? [],
            description: renderCommand(flag.description),
            env: flag.env ?? null,
            helpGroup: flag.helpGroup ?? null,
          })),
          examples: (command.examples ?? []).map((example) =>
            typeof example === 'string'
              ? {command: renderCommand(example), description: ''}
              : {
                  command: renderCommand(example.command),
                  description: renderCommand(example.description),
                },
          ),
          state: command.state ?? null,
        }
      }),
  }
}

export async function buildReference() {
  // Rebuild the manifest from compiled commands, never from a stale cache or user plugins.
  const plugin = new Plugin({
    root,
    ignoreManifest: true,
    errorOnManifestCreate: true,
  })
  await plugin.load()
  // oclif's cached manifest omits boolean defaults. Preserve explicit defaults
  // from the same command classes, including inherited base flags.
  for (const command of plugin.commands) {
    const loaded = await plugin.findCommand(command.id, {must: true})
    const flags = {...loaded.baseFlags, ...loaded.flags}
    for (const [name, flag] of Object.entries(command.flags)) {
      if (
        flag.type === 'boolean' &&
        typeof flags[name]?.default === 'boolean'
      ) {
        flag.default = flags[name].default
      }
    }
  }
  return referenceFromManifest(plugin.manifest)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const reference = await buildReference()
  const output = await format(JSON.stringify(reference), {
    ...(await resolveConfig(fileURLToPath(target))),
    filepath: fileURLToPath(target),
  })
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8').catch(() => '')) !== output) {
      throw new Error(
        'contracts/cli-reference.json is stale. Run npm run docs:reference.',
      )
    }
    console.log(
      `CLI reference is current (${reference.commands.length} commands).`,
    )
  } else {
    await writeFile(target, output)
    console.log(
      `Wrote contracts/cli-reference.json (${reference.commands.length} commands).`,
    )
  }
}
