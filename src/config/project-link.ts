import {mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {dirname, join, parse, resolve} from 'node:path'

import {PolymorfaConfigurationError} from '@polymorfa/sdk'

/** Directory-scoped project link. It never holds credentials. */
export const LINK_DIRECTORY = '.polymorfa'
export const LINK_FILE = 'project.json'

export interface ProjectLink {
  readonly project: string
  readonly version: 1
}

export interface FoundProjectLink extends ProjectLink {
  readonly path: string
}

export function linkPath(directory: string): string {
  return join(resolve(directory), LINK_DIRECTORY, LINK_FILE)
}

/** Find the nearest link file in `start` or one of its ancestors. */
export async function findProjectLink(
  start: string = process.cwd(),
): Promise<FoundProjectLink | undefined> {
  let directory = resolve(start)
  const {root} = parse(directory)
  for (;;) {
    const path = linkPath(directory)
    const link = await readProjectLink(path)
    if (link !== undefined) return {...link, path}
    if (directory === root) return undefined
    directory = dirname(directory)
  }
}

export async function readProjectLink(
  path: string,
): Promise<ProjectLink | undefined> {
  let serialized: string
  try {
    serialized = await readFile(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw new PolymorfaConfigurationError(
      `Could not read project link at ${path}.`,
      'link',
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw invalidLink(path)
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as {version?: unknown}).version !== 1 ||
    typeof (parsed as {project?: unknown}).project !== 'string' ||
    (parsed as {project: string}).project.trim().length === 0 ||
    Object.keys(parsed).some((key) => key !== 'version' && key !== 'project')
  ) {
    throw invalidLink(path)
  }
  return {project: (parsed as {project: string}).project, version: 1}
}

export async function writeProjectLink(
  directory: string,
  project: string,
): Promise<string> {
  const path = linkPath(directory)
  await mkdir(dirname(path), {recursive: true})
  const temporary = join(dirname(path), `.project-${randomUUID()}.tmp`)
  const link: ProjectLink = {project, version: 1}
  try {
    await writeFile(temporary, `${JSON.stringify(link, undefined, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o644,
    })
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return path
}

function invalidLink(path: string): PolymorfaConfigurationError {
  return new PolymorfaConfigurationError(
    `Project link at ${path} is invalid. Run polymorfa link again or delete the file.`,
    'link',
  )
}
