import {PolymorfaValidationError} from '@polymorfa/sdk'

/**
 * Run a jq filter with the embedded WebAssembly jq (no native binary).
 * Strings print raw, like `gh api --jq`; other values print as JSON.
 * The WebAssembly runtime has its own environment, so `$ENV` never exposes
 * host credentials.
 */
export async function applyJq(value: unknown, filter: string): Promise<string> {
  const {json, JqError} = await import('jq-wasm')
  // jq-wasm parses a string argument as JSON *text*, so a decoded JSON string
  // body would be re-parsed and fail. Serialize first so every value arrives
  // as the JSON it stands for. raw() trims the *entire* stdout stream inside
  // jq-wasm, including spaces and newlines that belong to string values.
  try {
    const values = await json<unknown>(JSON.stringify(value) ?? 'null', filter)
    return (
      values
        .map((item) =>
          typeof item === 'string' ? item : JSON.stringify(item, undefined, 2),
        )
        .join('\n') + (values.length === 0 ? '' : '\n')
    )
  } catch (error) {
    if (!(error instanceof JqError)) throw error
    const detail = error.stderr
      .trim()
      .replace(/^jq: error(?: \(at [^)]*\))?: /, '')
    throw new PolymorfaValidationError(
      `Invalid --jq filter: ${detail || `jq exited with ${error.exitCode}`}`,
      {code: 'invalid_jq'},
    )
  }
}
