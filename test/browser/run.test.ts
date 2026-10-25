import {readdirSync} from 'node:fs'
import {join, relative} from 'node:path'

import {describe, expect, it} from 'vitest'

import {
  COMMAND_IDS,
  resolveCommand,
  runCommand,
  splitWords,
} from '../../src/browser/index.js'
import {Buffer as BrowserBuffer} from '../../src/browser/stubs/buffer.js'
import {
  join,
  dirname,
  basename,
  extname,
  resolve,
} from '../../src/browser/stubs/path.js'

// A client token fixture: the SDK checks only the prefix of client tokens.
const CLIENT_TOKEN = `pmfa_ct_${'fixture'.repeat(6)}`

function run(line: string, respond: (url: URL, init: RequestInit) => Response) {
  const output: {stream: 'stdout' | 'stderr'; text: string}[] = []
  const requests: {method: string; url: URL; authorization: string | null}[] =
    []
  const fetchFixture = (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push({
      method: init.method ?? 'GET',
      url,
      authorization: new Headers(init.headers).get('authorization'),
    })
    return Promise.resolve(respond(url, init))
  }
  return runCommand(splitWords(line), {
    env: {POLYMORFA_CLIENT_TOKEN: CLIENT_TOKEN},
    fetch: fetchFixture,
    write: (stream, text) => output.push({stream, text}),
  }).then((result) => ({
    ...result,
    output,
    requests,
    stdout: output
      .filter((entry) => entry.stream === 'stdout')
      .map((entry) => entry.text)
      .join(''),
    stderr: output
      .filter((entry) => entry.stream === 'stderr')
      .map((entry) => entry.text)
      .join(''),
  }))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req_fixture',
    },
  })

describe('browser command runner', () => {
  it('splits words like a POSIX shell', () => {
    expect(
      splitWords(`message send text --body "Hello there" --to '+1 555' a\\ b`),
    ).toEqual([
      'message',
      'send',
      'text',
      '--body',
      'Hello there',
      '--to',
      '+1 555',
      'a b',
    ])
    expect(() => splitWords('api "open')).toThrow(SyntaxError)
  })

  it('resolves the longest command and keeps the rest as arguments', () => {
    expect(COMMAND_IDS).toContain('message send text')
    expect(resolveCommand(['message', 'send', 'text', '--to', 'x'])).toEqual({
      id: 'message send text',
      rest: ['--to', 'x'],
    })
    expect(resolveCommand(['nope'])).toBeNull()
  })

  it('runs the real command and prints what the installed CLI prints', async () => {
    const result = await run(
      'message send text --session 739182640518203 --to +15550002222 --body "Hello from Polymorfa"',
      () => json({success: true, data: {id: '3EB0FIXTURE', status: 'sent'}}),
    )
    expect(result).toMatchObject({exitCode: 0, command: 'message send text'})
    expect(result.stdout).toBe('Sent message 3EB0FIXTURE to +15550002222.\n')
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]).toMatchObject({
      method: 'POST',
      authorization: `Bearer ${CLIENT_TOKEN}`,
    })
    expect(result.requests[0]!.url.pathname).toBe(
      '/messaging/739182640518203/messages/send',
    )
  })

  it('prints the CLI JSON shape with --json', async () => {
    const result = await run(
      'message send text --session 739182640518203 --to +15550002222 --body hi --json',
      () => json({success: true, data: {id: '3EB0FIXTURE', status: 'sent'}}),
    )
    expect(JSON.parse(result.stdout)).toEqual({
      data: {id: '3EB0FIXTURE', status: 'sent'},
      metadata: {attempts: 1, status: 200, requestId: 'req_fixture'},
    })
  })

  it('reports usage errors and unknown commands with the CLI exit codes', async () => {
    const missing = await run(
      'message send text --session 739182640518203',
      () => json({}),
    )
    expect(missing.exitCode).toBe(2)
    expect(missing.stderr).toContain('Missing required flag body')
    const unknown = await run('nope nope', () => json({}))
    expect(unknown).toMatchObject({exitCode: 2, command: null})
    expect(unknown.stderr).toBe('Unknown command: polymorfa nope nope\n')
  })

  it('restores the process and fetch after each command', async () => {
    const before = {
      fetch: globalThis.fetch,
      write: Reflect.get(process.stdout, 'write') as unknown,
      env: process.env,
    }
    await run('nope', () => json({}))
    expect(globalThis.fetch).toBe(before.fetch)
    expect(Reflect.get(process.stdout, 'write')).toBe(before.write)
    expect(process.env).toBe(before.env)
  })
})

describe('browser command registry', () => {
  it('lists every command file, so regenerate it after adding a command', () => {
    const root = join(import.meta.dirname, '../../src/commands')
    const ids: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
          ids.push(
            relative(root, path).replace(/\.ts$/, '').split('/').join(' '),
          )
      }
    }
    walk(root)
    expect([...COMMAND_IDS].sort()).toEqual(ids.sort())
  })
})

describe('browser stand-ins', () => {
  it('encodes and decodes like Node for the methods the CLI uses', () => {
    const value = 'héllo, wörld'
    expect(BrowserBuffer.from(value).toString('base64')).toBe(
      Buffer.from(value).toString('base64'),
    )
    expect(
      BrowserBuffer.from(
        Buffer.from(value).toString('base64'),
        'base64',
      ).toString(),
    ).toBe(value)
    expect(BrowserBuffer.byteLength(value)).toBe(Buffer.byteLength(value))
    expect(
      BrowserBuffer.concat([
        BrowserBuffer.from('ab'),
        BrowserBuffer.from('cd'),
      ]).toString(),
    ).toBe('abcd')
    expect(BrowserBuffer.from('ff00', 'hex').toString('hex')).toBe('ff00')
  })

  it('joins and names POSIX paths', () => {
    expect(join('/a', 'b', '../c', 'd.txt')).toBe('/a/c/d.txt')
    expect([
      dirname('/a/b/c.json'),
      basename('/a/b/c.json'),
      extname('/a/b/c.json'),
    ]).toEqual(['/a/b', 'c.json', '.json'])
    expect(resolve('/a', 'b')).toBe('/a/b')
  })
})
