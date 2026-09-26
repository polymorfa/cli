import {spawnSync} from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'

import {
  completionScript,
  suggestCompletions,
  type CompletionCommand,
} from '../../src/services/completion.js'

const commands: CompletionCommand[] = [
  {
    id: 'version',
    flags: {
      json: {type: 'boolean'},
      profile: {type: 'option'},
    },
  },
  {
    id: 'api',
    flags: {
      json: {type: 'boolean'},
      profile: {type: 'option'},
      surface: {options: ['messaging', 'platform'], type: 'option'},
      token: {type: 'option'},
      verbose: {allowNo: true, type: 'boolean'},
    },
  },
  {id: 'auth:login', flags: {json: {type: 'boolean'}}},
  {id: 'auth:list', flags: {json: {type: 'boolean'}}},
  {id: 'completion:suggest', hidden: true},
]

describe('shell completion', () => {
  test('suggests command hierarchy and flags without positional values', () => {
    expect(suggestCompletions(commands, [], 'a')).toEqual(['api', 'auth'])
    expect(suggestCompletions(commands, ['auth'], 'l')).toEqual([
      'list',
      'login',
    ])
    expect(suggestCompletions(commands, ['api'], '--s')).toEqual(['--surface'])
    expect(suggestCompletions(commands, ['api'], '--no-v')).toEqual([
      '--no-verbose',
    ])
    expect(
      suggestCompletions(commands, ['api', '/platform/projects'], ''),
    ).toEqual([])
    expect(
      suggestCompletions(commands, ['api', '/platform/projects'], '--s'),
    ).toEqual(['--surface'])
    expect(suggestCompletions(commands, ['completion'], 's')).toEqual([])
  })

  test('suggests only fixed option values, never profile or token values', () => {
    expect(suggestCompletions(commands, ['api', '--surface'], 'm')).toEqual([
      'messaging',
    ])
    expect(suggestCompletions(commands, ['api'], '--surface=p')).toEqual([
      '--surface=platform',
    ])
    expect(
      suggestCompletions(commands, ['--profile', 'work', 'auth'], 'l'),
    ).toEqual(['list', 'login'])
    expect(suggestCompletions(commands, ['api', '--token'], '')).toEqual([])
    expect(suggestCompletions(commands, ['api', '--profile'], '')).toEqual([])
    expect(suggestCompletions(commands, ['api', '--', 'secret'], '')).toEqual(
      [],
    )
  })

  test('ignores unsafe metadata and never echoes an entered secret', () => {
    const secret = 'secret;$(curl private-host)'
    const unsafe: CompletionCommand[] = [
      ...commands,
      {id: `bad:${secret}`},
      {id: 'other', flags: {credential: {options: [secret], type: 'option'}}},
    ]
    expect(suggestCompletions(unsafe, [], '')).not.toContain('bad')
    expect(suggestCompletions(unsafe, ['other', '--credential'], '')).toEqual(
      [],
    )
    expect(
      JSON.stringify(suggestCompletions(unsafe, ['api', secret], '')),
    ).not.toContain(secret)
  })

  test('generates Bash and Zsh scripts with valid syntax', () => {
    for (const shell of ['bash', 'zsh'] as const) {
      const script = completionScript(shell)
      expect(script).toContain('polymorfa completion suggest')
      expect(script).not.toContain('POLYMORFA_API_KEY')
      const syntax = spawnSync(shell, ['-n'], {encoding: 'utf8', input: script})
      if (
        (syntax.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
      ) {
        continue
      }
      expect(syntax.status, syntax.stderr).toBe(0)
    }
  })

  test('Bash reconstructs a flag value split by COMP_WORDBREAKS', () => {
    const directory = mkdtempSync(join(tmpdir(), 'polymorfa-completion-'))
    const command = join(directory, 'polymorfa')
    const argumentsFile = join(directory, 'arguments')
    try {
      writeFileSync(
        command,
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$COMP_TEST_ARGS"\nprintf "%s\\n" --surface=platform\n',
      )
      chmodSync(command, 0o755)
      const result = spawnSync(
        'bash',
        [
          '-c',
          'eval "$POLYMORFA_SCRIPT"; COMP_WORDS=(polymorfa api --surface = p); COMP_CWORD=4; _polymorfa_completion; printf "%s\\n" "${COMPREPLY[@]}"',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            COMP_TEST_ARGS: argumentsFile,
            PATH: `${directory}:${process.env.PATH ?? ''}`,
            POLYMORFA_SCRIPT: completionScript('bash'),
          },
        },
      )
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('platform\n')
      expect(readFileSync(argumentsFile, 'utf8')).toBe(
        'completion\nsuggest\n--current=--surface=p\n--\napi\n',
      )
    } finally {
      rmSync(directory, {force: true, recursive: true})
    }
  })

  test('generates Fish completion from tokens before the cursor', () => {
    const script = completionScript('fish')
    expect(script).toContain('commandline -xpc')
    expect(script).toContain('commandline -ct')
    expect(script).toContain('--current="$current"')
    expect(script).toContain('complete -c polymorfa -f')
    expect(script).toContain('polymorfa completion suggest')
  })
})
