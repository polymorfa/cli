import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'polymorfa-cli-test-'))
}
