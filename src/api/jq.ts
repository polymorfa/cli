import {PolymorfaValidationError} from '@polymorfa/sdk'

/**
 * Run a jq filter with the embedded WebAssembly jq (no native binary).
 * Strings print raw, like `gh api --jq`; other values print as JSON.
 * The WebAssembly runtime has its own environment, so `$ENV` never exposes
 * host credentials.
 */
export async function applyJq(value: unknown, filter: string): Promise<string> {
  const {raw} = await import('jq-wasm')
  // jq-wasm parses a string argument as JSON *text*, so a decoded JSON string
  // body would be re-parsed and fail. Serialize first so every value arrives
  // as the JSON it stands for.
  const result = await raw(JSON.stringify(value) ?? 'null', filter, ['-r'])
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
