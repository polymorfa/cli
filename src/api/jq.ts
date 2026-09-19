import {PolymorfaValidationError} from '@polymorfa/sdk'

/**
 * Run a jq filter with the embedded WebAssembly jq (no native binary).
 * Strings print raw, like `gh api --jq`; other values print as JSON.
 * The WebAssembly runtime has its own environment, so `$ENV` never exposes
 * host credentials.
 */
export async function applyJq(value: unknown, filter: string): Promise<string> {
  const {raw} = await import('jq-wasm')
  const result = await raw(value as Parameters<typeof raw>[0], filter, ['-r'])
  if (result.exitCode !== 0) {
    const detail = result.stderr
      .trim()
      .replace(/^jq: error(?: \(at [^)]*\))?: /, '')
    throw new PolymorfaValidationError(
      `Invalid --jq filter: ${detail || `jq exited with ${result.exitCode}`}`,
      {code: 'invalid_jq'},
    )
  }
  return result.stdout
}
