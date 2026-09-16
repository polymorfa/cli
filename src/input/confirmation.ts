import {PolymorfaValidationError} from '@polymorfa/sdk'
import {createInterface} from 'node:readline/promises'
import type {Readable, Writable} from 'node:stream'

interface TtyReadable extends Readable {
  readonly isTTY?: boolean
}

interface TtyWritable extends Writable {
  readonly isTTY?: boolean
}

export async function confirmDangerous(input: {
  readonly input?: TtyReadable
  readonly output?: TtyWritable
  readonly prompt: string
  readonly yes: boolean
}): Promise<void> {
  if (input.yes) return
  const source = input.input ?? process.stdin
  const output = input.output ?? process.stderr
  if (source.isTTY !== true || output.isTTY !== true) {
    throw new PolymorfaValidationError(
      `${input.prompt} Re-run with --yes in noninteractive environments.`,
      {code: 'confirmation_required'},
    )
  }

  const reader = createInterface({input: source, output})
  try {
    const answer = await reader.question(
      `${input.prompt} Type yes to continue: `,
    )
    if (answer.trim().toLowerCase() !== 'yes') {
      throw new PolymorfaValidationError('Confirmation declined.', {
        code: 'confirmation_declined',
      })
    }
  } finally {
    reader.close()
  }
}
