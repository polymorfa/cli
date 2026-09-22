import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

const API_KEY =
  'pmfa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('typed message send commands', () => {
  let server: TestHttpServer | undefined
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-cli-send-'))
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    await rm(directory, {force: true, recursive: true})
  })

  test('uploads a local image as base64 with an inferred MIME type', async () => {
    const path = join(directory, 'photo.png')
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'image',
      '--session',
      'session_1',
      '--to',
      '+15551234567',
      '--file',
      path,
      '--caption',
      'Look',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toEqual({
      conversation: {phoneNumber: '+15551234567'},
      content: {
        image: {base64: 'iVBORw==', mimeType: 'image/png', caption: 'Look'},
      },
    })
    expect(server.requests[0]?.url).toBe('/messaging/session_1/messages/send')
  })

  test('sends a video by URL without reading local files', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'video',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--url',
      'https://example.com/clip.mp4',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toEqual({
      conversation: {id: '730000000001'},
      content: {video: {url: 'https://example.com/clip.mp4'}},
    })
  })

  test('sends audio as a voice note', async () => {
    const path = join(directory, 'note.ogg')
    await writeFile(path, 'OggS')
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'audio',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--file',
      path,
      '--voice',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {voice: {mimeType: 'audio/ogg', ptt: true}},
    })
  })

  test('sends a document with the local file name and idempotency key', async () => {
    const path = join(directory, 'invoice.pdf')
    await writeFile(path, '%PDF-1.7')
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'document',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--file',
      path,
      '--idempotency-key',
      'doc_1',
      '--reply-to',
      '740000000009',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        file: {filename: 'invoice.pdf', mimeType: 'application/pdf'},
      },
      quotedMessage: {id: '740000000009'},
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('doc_1')
  })

  test('rejects media without exactly one source before transport', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'image',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--json',
    ])

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('exactly one of --file or --url')
    expect(server.requests).toHaveLength(0)
  })

  test('rejects files above --max-bytes before transport', async () => {
    const path = join(directory, 'big.jpg')
    await writeFile(path, Buffer.alloc(32))
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'image',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--file',
      path,
      '--max-bytes',
      '16',
      '--json',
    ])

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('exceeds the 16 byte limit')
    expect(server.requests).toHaveLength(0)
  })

  test('sends a template with components from a file', async () => {
    const path = join(directory, 'components.json')
    await writeFile(
      path,
      JSON.stringify([
        {type: 'body', parameters: [{type: 'text', text: 'A1'}]},
      ]),
    )
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'template',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--name',
      'order_update',
      '--language',
      'en_US',
      '--components',
      path,
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        template: {
          components: [
            {type: 'body', parameters: [{type: 'text', text: 'A1'}]},
          ],
          language: 'en_US',
          name: 'order_update',
        },
      },
    })
  })

  test('rejects non-array template components', async () => {
    const path = join(directory, 'components.json')
    await writeFile(path, '{}')
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'template',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--name',
      'n',
      '--language',
      'en',
      '--components',
      path,
      '--json',
    ])

    expect(exitCode(result.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test('sends a location with signed coordinates', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'location',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--lat',
      '51.5007',
      '--long=-0.1246',
      '--address',
      'Westminster',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        location: {address: 'Westminster', lat: 51.5007, long: -0.1246},
      },
    })
  })

  test('rejects out-of-range coordinates', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'location',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--lat',
      '91',
      '--long',
      '0',
      '--json',
    ])

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('--lat must be a number')
    expect(server.requests).toHaveLength(0)
  })

  test('builds a contact vCard from flags', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'contact',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--name',
      '"Ada, Countess"',
      '--phone',
      '+15557654321',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        contact: {
          vcard:
            'BEGIN:VCARD\nVERSION:3.0\nFN:Ada\\, Countess\nTEL;type=CELL;waid=15557654321:+15557654321\nEND:VCARD',
        },
      },
    })
  })

  test('reads a contact vCard file', async () => {
    const path = join(directory, 'ada.vcf')
    await writeFile(path, 'BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEND:VCARD\n')
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'contact',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--vcard',
      path,
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        contact: {vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEND:VCARD'},
      },
    })
  })

  test('sends a multi-select poll', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'poll',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--title',
      'Lunch?',
      '--option',
      'Pizza',
      '--option',
      'Sushi',
      '--multi-select',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        poll: {multiSelect: true, options: ['Pizza', 'Sushi'], title: 'Lunch?'},
      },
    })
  })

  test('rejects polls with duplicate or too few options', async () => {
    server = await messageServer()

    const one = await send([
      'message',
      'send',
      'poll',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--title',
      'Q',
      '--option',
      'A',
      '--json',
    ])
    const duplicate = await send([
      'message',
      'send',
      'poll',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--title',
      'Q',
      '--option',
      'A',
      '--option',
      'A',
      '--json',
    ])

    expect(exitCode(one.error)).toBe(2)
    expect(exitCode(duplicate.error)).toBe(2)
    expect(server.requests).toHaveLength(0)
  })

  test('sends buttons of every supported type', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'buttons',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--body',
      'Pick',
      '--footer',
      'Thanks',
      '--button',
      'reply:yes=Yes',
      '--button',
      'url:Open=https://example.com/a?b=c',
      '--button',
      '"call:Call us=+15550001111"',
      '--button',
      'copy:Code=SAVE10',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        buttons: {
          body: 'Pick',
          buttons: [
            {id: 'yes', text: 'Yes', type: 'reply'},
            {text: 'Open', type: 'url', url: 'https://example.com/a?b=c'},
            {phoneNumber: '+15550001111', text: 'Call us', type: 'call'},
            {copyCode: 'SAVE10', text: 'Code', type: 'copy'},
          ],
          footer: 'Thanks',
        },
      },
    })
  })

  test('rejects malformed buttons before transport', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'buttons',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--body',
      'Pick',
      '--button',
      'reply:yes',
      '--json',
    ])

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('Invalid --button')
    expect(server.requests).toHaveLength(0)
  })

  test('groups list rows into sections', async () => {
    server = await messageServer()

    const result = await send([
      'message',
      'send',
      'list',
      '--session',
      'session_1',
      '--to',
      '730000000001',
      '--title',
      'Slots',
      '--button-text',
      'Choose',
      '--row',
      'Morning/am9=9:00',
      '--row',
      'Morning/am10=10:00|Quiet',
      '--row',
      'Afternoon/pm2=14:00',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(sentBody()).toMatchObject({
      content: {
        list: {
          buttonText: 'Choose',
          sections: [
            {
              rows: [
                {id: 'am9', title: '9:00'},
                {description: 'Quiet', id: 'am10', title: '10:00'},
              ],
              title: 'Morning',
            },
            {rows: [{id: 'pm2', title: '14:00'}], title: 'Afternoon'},
          ],
          title: 'Slots',
        },
      },
    })
  })

  test('edits a message through the chats resource', async () => {
    server = await startHttpServer({body: {success: true}})

    const result = await send([
      'message',
      'edit',
      '740000000001',
      '--session',
      'session_1',
      '--chat',
      '730000000001',
      '--body',
      'Fixed',
      '--json',
    ])

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({text: 'Fixed'}),
      method: 'PUT',
      url: '/messaging/session_1/chats/730000000001/messages/740000000001',
    })
  })

  test('requires confirmation before deleting a message', async () => {
    server = await startHttpServer({body: {success: true}})

    const refused = await send([
      'message',
      'delete',
      '740000000001',
      '--session',
      'session_1',
      '--chat',
      '730000000001',
      '--json',
    ])
    expect(exitCode(refused.error)).toBe(2)
    expect(server.requests).toHaveLength(0)

    const result = await send([
      'message',
      'delete',
      '740000000001',
      '--session',
      'session_1',
      '--chat',
      '730000000001',
      '--yes',
      '--json',
    ])
    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/session_1/chats/730000000001/messages/740000000001',
    })
  })

  function sentBody(): unknown {
    return JSON.parse(server?.requests[0]?.body ?? 'null')
  }

  async function send(argv: string[]) {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: API_KEY,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      () => runCommand(argv),
    )
  }
})

async function messageServer(): Promise<TestHttpServer> {
  return startHttpServer({
    body: {
      data: {
        conversation: {id: '730000000001'},
        id: '740000000001',
        status: 'sent',
        timestamp: '2026-09-19T00:00:00.000Z',
        type: 'image',
        whatsapp_id: '3A0000',
      },
      success: true,
    },
  })
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
