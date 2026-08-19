export type OutputMode = 'human' | 'json' | 'quiet'

export function renderValue(
  value: unknown,
  mode: OutputMode,
  human = String(value),
): string | undefined {
  if (mode === 'quiet') return undefined
  if (mode === 'json') {
    const json = JSON.stringify(value)
    if (json === undefined) throw new TypeError('Cannot render undefined as JSON.')
    return `${json}\n`
  }

  return `${human}\n`
}
