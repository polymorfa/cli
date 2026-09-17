import {rmSync} from 'node:fs'
import {fileURLToPath, URL} from 'node:url'

const distributionDirectory = fileURLToPath(
  new URL('../dist/', import.meta.url),
)

rmSync(distributionDirectory, {force: true, recursive: true})
