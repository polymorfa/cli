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
import {process as browserProcess} from '../../src/browser/stubs/process.js'
import * as browserPath from '../../src/browser/stubs/path.js'

// A client token fixture: the SDK checks only the prefix of client tokens.
const CLIENT_TOKEN = `pmfa_ct_${'fixture'.repeat(6)}`
// A well-formed team key fixture for Platform commands. Not a real key.
const API_KEY = `pmfa_${'A'.repeat(72)}`
const PROJECT = '11111111-1111-4111-8111-111111111111'

function run(
  line: string,
  respond: (url: URL, init: RequestInit) => Response,
  options: {env?: Record<string, string>; signal?: AbortSignal} = {},
) {
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
    env: options.env ?? {POLYMORFA_CLIENT_TOKEN: CLIENT_TOKEN},
    fetch: fetchFixture,
    write: (stream, text) => output.push({stream, text}),
    ...(options.signal ? {signal: options.signal} : {}),
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

  it('keeps backslashes inside double quotes unless they escape a special character', () => {
    expect(
      splitWords(String.raw`message send text --body "C:\new\path"`),
    ).toEqual(['message', 'send', 'text', '--body', String.raw`C:\new\path`])
    expect(splitWords(String.raw`"a\"b \\ \$x \q"`)).toEqual([
      String.raw`a"b \ $x \q`,
    ])
  })

  it('resolves only real commands, not inherited object keys', async () => {
    expect(resolveCommand(['constructor'])).toBeNull()
    const result = await run('constructor', () => json({}))
    expect(result).toMatchObject({exitCode: 2, command: null})
    expect(result.stderr).toBe('Unknown command: polymorfa constructor\n')
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

  it('runs commands started together one after another', async () => {
    const order: string[] = []
    const respond = (url: URL) => {
      order.push(url.pathname)
      return json({success: true, data: {id: '3EB0FIXTURE', status: 'sent'}})
    }
    const [first, second] = await Promise.all([
      run(
        'message send text --session 739182640518203 --to +15550002222 --body one',
        respond,
      ),
      run(
        'message send text --session 739182640518204 --to +15550002222 --body two',
        respond,
      ),
    ])
    expect([first.exitCode, second.exitCode]).toEqual([0, 0])
    expect(first.stdout).toBe('Sent message 3EB0FIXTURE to +15550002222.\n')
    expect(second.stdout).toBe('Sent message 3EB0FIXTURE to +15550002222.\n')
    expect(order).toEqual([
      '/messaging/739182640518203/messages/send',
      '/messaging/739182640518204/messages/send',
    ])
  })

  it('calls write callbacks and decodes UTF-8 bytes while a command runs', async () => {
    let flushed = false
    const result = await run(
      'message send text --session 739182640518203 --to +15550002222 --body hi',
      () => {
        process.stdout.write(new TextEncoder().encode('héllo\n'), () => {
          flushed = true
        })
        return json({success: true, data: {id: '3EB0FIXTURE', status: 'sent'}})
      },
    )
    expect(flushed).toBe(true)
    expect(result.stdout).toBe(
      'héllo\nSent message 3EB0FIXTURE to +15550002222.\n',
    )
  })

  it('refuses a command whose output is binary audio before it runs', async () => {
    const result = await run('calls media --session 739182640518203', () =>
      json({}),
    )
    expect(result).toMatchObject({exitCode: 1, command: 'calls media'})
    expect(result.stderr).toContain('streams call audio as binary PCM')
    expect(result.requests).toHaveLength(0)
  })

  it('stops a following command on abort, cleans up, then runs the next', async () => {
    const before = process.listeners('SIGINT').length
    const controller = new AbortController()
    const tail = run(
      `logs tail --project ${PROJECT} --backfill 0 --poll-interval 1 --json`,
      () => {
        setTimeout(() => controller.abort(), 0)
        return json({
          data: [],
          page: {nextCursor: null, hasMore: false, followCursor: 'c1'},
        })
      },
      {env: {POLYMORFA_API_KEY: API_KEY}, signal: controller.signal},
    )
    const next = run('nope', () => json({}))
    const result = await tail
    expect(result).toMatchObject({exitCode: 0, command: 'logs tail'})
    expect(result.requests.length).toBeGreaterThan(0)
    expect((await next).exitCode).toBe(2)
    expect(process.listeners('SIGINT')).toHaveLength(before)
  })

  it('reports a command interrupted before it starts', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await run('version', () => json({}), {
      signal: controller.signal,
    })
    expect(result).toMatchObject({exitCode: 130, command: 'version'})
    expect(result.stdout).toBe('')
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
  it('lets commands add and remove process and stream listeners', () => {
    const stop = () => undefined
    browserProcess.once('SIGINT', stop)
    expect(browserProcess.listeners('SIGINT')).toEqual([stop])
    browserProcess.removeListener('SIGINT', stop)
    expect(browserProcess.listeners('SIGINT')).toEqual([])
    const closed = () => undefined
    browserProcess.stdout.on('error', closed)
    browserProcess.stdout.removeListener('error', closed)
    expect(browserProcess.stdout.listeners('error')).toEqual([])
    let flushed = false
    browserProcess.stdout.write('x', () => {
      flushed = true
    })
    return Promise.resolve().then(() => expect(flushed).toBe(true))
  })

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
    expect(browserPath.join('/a', 'b', '../c', 'd.txt')).toBe('/a/c/d.txt')
    expect([
      browserPath.dirname('/a/b/c.json'),
      browserPath.basename('/a/b/c.json'),
      browserPath.extname('/a/b/c.json'),
    ]).toEqual(['/a/b', 'c.json', '.json'])
    expect(browserPath.resolve('/a', 'b')).toBe('/a/b')
  })
})
