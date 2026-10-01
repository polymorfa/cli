/** Completion uses only local command metadata. It never resolves a profile or calls an API. */
export interface CompletionFlag {
  readonly allowNo?: boolean
  readonly char?: string
  readonly hidden?: boolean
  readonly options?: readonly string[]
  readonly type?: string
}

export interface CompletionCommand {
  readonly aliases?: readonly string[]
  readonly flags?: Readonly<Record<string, CompletionFlag>>
  readonly hidden?: boolean
  readonly id: string
}

const SAFE_WORD = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export function suggestCompletions(
  commands: readonly CompletionCommand[],
  priorWords: readonly string[],
  current = '',
): string[] {
  const visible = commands.filter((command) => !command.hidden)
  const paths = visible.flatMap((command) =>
    [command.id, ...(command.aliases ?? [])]
      .map((id) => id.split(':'))
      .filter((parts) => parts.every((part) => SAFE_WORD.test(part))),
  )
  let path: string[] = []
  let pending: CompletionFlag | undefined
  let positional = false
  let stopped = false

  for (const word of priorWords) {
    if (pending !== undefined) {
      pending = undefined
      continue
    }
    if (word === '--') {
      stopped = true
      continue
    }
    if (stopped) continue
    if (word.startsWith('-')) {
      const [name, value] = word.split('=', 2)
      const flag = availableFlags(visible, path).find(
        ([candidate]) => candidate === name,
      )?.[1]
      if (flag?.type === 'option' && value === undefined) pending = flag
      continue
    }
    if (
      !positional &&
      paths.some(
        (parts) =>
          parts.length > path.length &&
          path.every((part, index) => parts[index] === part) &&
          parts[path.length] === word,
      )
    ) {
      path = [...path, word]
      continue
    }
    // Positional values are never a source of suggestions. Flags can still
    // follow them.
    if (!paths.some((parts) => parts.join(':') === path.join(':'))) return []
    positional = true
  }

  if (stopped) return []
  if (pending !== undefined) {
    return safeCandidates(pending.options ?? [], current)
  }

  const equals = current.indexOf('=')
  if (current.startsWith('-') && equals > 0) {
    const flag = availableFlags(visible, path).find(
      ([candidate]) => candidate === current.slice(0, equals),
    )?.[1]
    return flag?.type === 'option'
      ? safeCandidates(flag.options ?? [], current.slice(equals + 1)).map(
          (option) => `${current.slice(0, equals + 1)}${option}`,
        )
      : []
  }
  if (current.startsWith('-')) {
    return safeCandidates(
      [...availableFlags(visible, path).map(([name]) => name), '--help', '-h'],
      current,
    )
  }

  if (positional) return []

  return safeCandidates(
    paths
      .filter(
        (parts) =>
          parts.length > path.length &&
          path.every((part, index) => parts[index] === part),
      )
      .map((parts) => parts[path.length] ?? ''),
    current,
  )
}

function availableFlags(
  commands: readonly CompletionCommand[],
  path: readonly string[],
): [string, CompletionFlag][] {
  const command = commands.find((item) => item.id === path.join(':'))
  const root = commands.find((item) => item.id === 'version')
  return Object.entries(command?.flags ?? root?.flags ?? {}).flatMap(
    ([name, flag]) =>
      flag.hidden || !SAFE_WORD.test(name)
        ? []
        : [
            [`--${name}`, flag] as [string, CompletionFlag],
            ...(flag.type === 'boolean' && flag.allowNo
              ? [[`--no-${name}`, flag] as [string, CompletionFlag]]
              : []),
            ...(flag.char === undefined || !SAFE_WORD.test(flag.char)
              ? []
              : [[`-${flag.char}`, flag] as [string, CompletionFlag]]),
          ],
  )
}

function safeCandidates(values: readonly string[], prefix: string): string[] {
  return [
    ...new Set(
      values.filter(
        (value) =>
          SAFE_WORD.test(value.replace(/^-+/, '')) && value.startsWith(prefix),
      ),
    ),
  ].sort()
}

export type CompletionShell = 'bash' | 'fish' | 'zsh'

export function completionScript(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
      return `# Polymorfa Bash completion. Suggestions use only local command metadata.
_polymorfa_completion() {
  local current="\${COMP_WORDS[COMP_CWORD]}"
  local -a prior=("\${COMP_WORDS[@]:1:$((COMP_CWORD-1))}")
  local output candidate option_prefix=""
  if (( COMP_CWORD >= 3 )) && [[ \${COMP_WORDS[COMP_CWORD-1]} == '=' && \${COMP_WORDS[COMP_CWORD-2]} == --* ]]; then
    option_prefix="\${COMP_WORDS[COMP_CWORD-2]}="
    current="$option_prefix$current"
    prior=("\${COMP_WORDS[@]:1:$((COMP_CWORD-3))}")
  elif (( COMP_CWORD >= 2 )) && [[ $current == '=' && \${COMP_WORDS[COMP_CWORD-1]} == --* ]]; then
    option_prefix="\${COMP_WORDS[COMP_CWORD-1]}="
    current="$option_prefix"
    prior=("\${COMP_WORDS[@]:1:$((COMP_CWORD-2))}")
  fi
  COMPREPLY=()
  output="$(command polymorfa completion suggest --current="$current" -- "\${prior[@]}" 2>/dev/null)" || return
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    if [[ -n "$option_prefix" && $candidate == "$option_prefix"* ]]; then
      candidate="\${candidate#"$option_prefix"}"
    fi
    COMPREPLY+=("$candidate")
  done <<< "$output"
}
complete -o bashdefault -o default -F _polymorfa_completion polymorfa`
    case 'zsh':
      return `#compdef polymorfa
# Polymorfa Zsh completion. Suggestions use only local command metadata.
_polymorfa_completion() {
  local -a prior candidates
  local output i
  for (( i = 2; i < CURRENT; i++ )); do
    prior+=("\${words[i]}")
  done
  output="$(command polymorfa completion suggest --current="\${words[CURRENT]}" -- "\${prior[@]}" 2>/dev/null)" || return
  [[ -n "$output" ]] || return
  candidates=("\${(@f)output}")
  compadd -- "\${candidates[@]}"
}
compdef _polymorfa_completion polymorfa`
    case 'fish':
      return `# Polymorfa Fish completion. Suggestions use only local command metadata.
function __polymorfa_completion
    set -l prior (commandline -xpc)
    set -e prior[1]
    set -l current (commandline -ct)
    command polymorfa completion suggest --current="$current" -- $prior 2>/dev/null
end
complete -c polymorfa -f -a '(__polymorfa_completion)'`
  }
}
