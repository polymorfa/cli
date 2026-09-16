import {constants} from 'node:fs'
import {access, link, lstat, open, unlink} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'
import {randomBytes} from 'node:crypto'

export interface PreparedSecretFile {
  readonly path: string
  write(secret: string): Promise<void>
}

export async function prepareSecretFile(
  path: string,
): Promise<PreparedSecretFile> {
  const parent = dirname(path)
  const parentStats = await lstat(parent)
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error('The secret output parent must be a regular directory.')
  }
  await access(parent, constants.W_OK)
  try {
    await lstat(path)
    throw new Error(`The secret output file already exists: ${path}`)
  } catch (error) {
    if (!isMissing(error)) throw error
  }

  return {
    path,
    async write(secret: string): Promise<void> {
      const temporary = join(
        parent,
        `.${basename(path)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
      )
      const handle = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      )
      let linked = false
      try {
        await handle.writeFile(`${secret}\n`, 'utf8')
        await handle.sync()
        await handle.close()
        await link(temporary, path)
        linked = true
        await unlink(temporary)
        await syncDirectory(parent)
      } catch (error) {
        await handle.close().catch(() => {})
        await unlink(temporary).catch(() => {})
        if (isExists(error))
          throw new Error(`The secret output file already exists: ${path}`)
        throw error
      }
      if (!linked) throw new Error('The secret output file was not created.')
    },
  }
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function isMissing(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isExists(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
