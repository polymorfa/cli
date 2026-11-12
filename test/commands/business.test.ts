import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test} from 'vitest'

import {
  startHttpServer,
  startHttpSequenceServer,
  withEnvironment,
  type TestHttpServer,
} from '../helpers/http-server.js'

describe('business commands', () => {
  let directory: string | undefined
  let server: TestHttpServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (directory !== undefined)
      await rm(directory, {force: true, recursive: true})
    directory = undefined
  })

  test('rejects client tokens before a Business App request', async () => {
    server = await startHttpServer({body: {data: {}, success: true}})

    const result = await clientTokenEnvironment(() =>
      runCommand('business profile view --session session_1 --json'),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Business App commands require a server API key',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('views the connected account own business profile', async () => {
    server = await startHttpServer({
      body: {data: businessProfile(), success: true},
      headers: {'request-id': 'req_business_profile'},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand('business profile view --session session/main --json'),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.stdout)).toEqual({
      data: businessProfile(),
      metadata: {
        attempts: 1,
        requestId: 'req_business_profile',
        status: 200,
      },
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/business/profile',
    )
  })

  test('updates structured profile fields from one bounded JSON input', async () => {
    const input = await jsonInput('profile.json', {
      address: '1 Example Street',
      hours: {
        days: [
          {
            closeTime: 1020,
            dayOfWeek: 'mon',
            mode: 'specific_hours',
            openTime: 540,
          },
        ],
        timeZone: 'Europe/Zurich',
      },
      websites: ['https://example.com'],
    })
    server = await startHttpServer({
      body: {data: {status: 'UPDATED'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `business profile update --session session_1 --input ${input} --idempotency-key profile_1 --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toMatchObject({
      address: '1 Example Street',
      hours: {timeZone: 'Europe/Zurich'},
    })
    expect(server.requests[0]).toMatchObject({
      method: 'PATCH',
      url: '/messaging/session_1/business/profile',
    })
    expect(server.requests[0]?.headers['idempotency-key']).toBe('profile_1')
  })

  test('sets a cover photo from a bounded local file and deletes by encoded ID', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-business-cover-'))
    const picture = join(directory, 'cover.jpg')
    await writeFile(picture, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
    server = await startHttpSequenceServer([
      {body: {data: {coverPhotoId: 'cover/1'}, success: true}},
      {body: {data: {status: 'DELETED'}, success: true}},
    ])

    const setResult = await apiKeyEnvironment(() =>
      runCommand(
        `business profile cover set --session session/main --file ${picture} --idempotency-key cover_set --json`,
      ),
    )
    const deleteResult = await apiKeyEnvironment(() =>
      runCommand(
        'business profile cover delete cover/1 --session session/main --yes --idempotency-key cover_delete --json',
      ),
    )

    expect(setResult.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual({
      base64: '/9j/2Q==',
    })
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/business/profile/cover-photo',
    )
    expect(deleteResult.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/session%2Fmain/business/profile/cover-photo/cover%2F1',
    })
  })

  test('views a bounded catalog page with its exact cursor and image query', async () => {
    server = await startHttpServer({
      body: {data: {next: 'cursor_2', products: []}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'business catalog view --session session_1 --id 750000000001 --after cursor_1 --limit 25 --width 320 --height 240 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/business/catalog?id=750000000001&after=cursor_1&limit=25&width=320&height=240',
    )
  })

  test('creates the account catalog and changes its cart setting', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {success: true}, success: true}},
      {body: {data: {success: true}, success: true}},
    ])

    const createResult = await apiKeyEnvironment(() =>
      runCommand(
        'business catalog create --session session_1 --idempotency-key catalog_create --json',
      ),
    )
    const cartResult = await apiKeyEnvironment(() =>
      runCommand(
        'business catalog cart set --session session_1 --enabled false --idempotency-key cart_off --json',
      ),
    )

    expect(createResult.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/session_1/business/catalog',
    })
    expect(cartResult.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      body: JSON.stringify({enabled: false}),
      method: 'PATCH',
      url: '/messaging/session_1/business/catalog/cart',
    })
  })

  test('views a product for an explicit business JID', async () => {
    server = await startHttpServer({body: {data: product(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'business product view product/1 --session session/main --id 750000000001 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session%2Fmain/business/products/product%2F1?id=750000000001',
    )
  })

  test('creates a product from one typed JSON document', async () => {
    const input = await jsonInput('product.json', productMutation(false))
    server = await startHttpServer({body: {data: product(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `business product create --session session_1 --input ${input} --idempotency-key product_create --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toEqual(
      productMutation(false),
    )
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/messaging/session_1/business/products',
    })
  })

  test('turns a bounded product image file into the SDK base64 source', async () => {
    directory = await mkdtemp(join(tmpdir(), 'polymorfa-product-image-'))
    const image = join(directory, 'product.jpg')
    const input = join(directory, 'product.json')
    await writeFile(image, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
    await writeFile(
      input,
      JSON.stringify({
        hidden: false,
        images: [{file: image}],
        name: 'Local image product',
      }),
    )
    server = await startHttpServer({body: {data: product(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `business product create --session session_1 --input ${input} --json`,
      ),
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(server.requests[0]?.body ?? '')).toMatchObject({
      images: [{base64: '/9j/2Q=='}],
      name: 'Local image product',
    })
  })

  test('requires replacement product input to state hidden explicitly', async () => {
    const input = await jsonInput('replacement.json', {
      images: [{url: 'https://example.com/product.jpg'}],
      name: 'Replacement product',
    })
    server = await startHttpServer({body: {data: product(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        `business product replace product_1 --session session_1 --input ${input} --json`,
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain(
      'Replacement product input must explicitly include hidden',
    )
    expect(server.requests).toHaveLength(0)
  })

  test('replaces and deletes a product with explicit safety controls', async () => {
    const input = await jsonInput('replacement.json', productMutation(true))
    server = await startHttpSequenceServer([
      {body: {data: product(), success: true}},
      {body: {data: {deletedCount: 1}, success: true}},
    ])

    const replaceResult = await apiKeyEnvironment(() =>
      runCommand(
        `business product replace product/1 --session session_1 --input ${input} --idempotency-key product_replace --json`,
      ),
    )
    const deleteResult = await apiKeyEnvironment(() =>
      runCommand(
        'business product delete product/1 --session session_1 --yes --idempotency-key product_delete --json',
      ),
    )

    expect(replaceResult.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/messaging/session_1/business/products/product%2F1',
    })
    expect(deleteResult.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/session_1/business/products/product%2F1',
    })
  })

  test('sets product visibility and submits an appeal reason', async () => {
    server = await startHttpSequenceServer([
      {body: {data: {success: true}, success: true}},
      {body: {data: {success: true}, success: true}},
    ])

    const visibilityResult = await apiKeyEnvironment(() =>
      runCommand(
        'business product visibility set product_1 --session session_1 --hidden true --idempotency-key hidden_1 --json',
      ),
    )
    const appealResult = await apiKeyEnvironment(() =>
      runCommand(
        'business product appeal product_1 --session session_1 --reason "Please review" --idempotency-key appeal_1 --json',
      ),
    )

    expect(visibilityResult.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({hidden: true}),
      method: 'PATCH',
      url: '/messaging/session_1/business/products/product_1/visibility',
    })
    expect(appealResult.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      body: JSON.stringify({reason: 'Please review'}),
      method: 'POST',
      url: '/messaging/session_1/business/products/product_1/appeal',
    })
  })

  test('lists bounded collection pages without inventing automatic pagination', async () => {
    server = await startHttpServer({
      body: {data: {collections: [], next: 'next_2'}, success: true},
    })

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'business collection list --session session_1 --id 750000000001 --after next_1 --collection-limit 10 --item-limit 40 --width 128 --height 96 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/business/collections?id=750000000001&after=next_1&collectionLimit=10&itemLimit=40&width=128&height=96',
    )
  })

  test('views one collection while preserving the source one-way after cursor', async () => {
    server = await startHttpServer({body: {data: collection(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'business collection view collection/1 --session session_1 --id 750000000001 --after product_cursor --limit 20 --width 256 --height 256 --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/business/collections/collection%2F1?id=750000000001&after=product_cursor&limit=20&width=256&height=256',
    )
  })

  test('creates and updates collections with repeatable product flags', async () => {
    server = await startHttpSequenceServer([
      {
        body: {
          data: {id: 'collection_1', reviewStatus: 'PENDING'},
          success: true,
        },
      },
      {
        body: {
          data: {id: 'collection_1', reviewStatus: 'PENDING'},
          success: true,
        },
      },
    ])

    const createResult = await apiKeyEnvironment(() =>
      runCommand(
        'business collection create --session session_1 --name Featured --product product_1 --product product_2 --idempotency-key collection_create --json',
      ),
    )
    const updateResult = await apiKeyEnvironment(() =>
      runCommand(
        'business collection update collection_1 --session session_1 --name Updated --add-product product_3 --remove-product product_1 --idempotency-key collection_update --json',
      ),
    )

    expect(createResult.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({
        name: 'Featured',
        productIds: ['product_1', 'product_2'],
      }),
      method: 'POST',
      url: '/messaging/session_1/business/collections',
    })
    expect(updateResult.error).toBeUndefined()
    expect(JSON.parse(server.requests[1]?.body ?? '')).toEqual({
      addProductIds: ['product_3'],
      name: 'Updated',
      removeProductIds: ['product_1'],
    })
    expect(server.requests[1]).toMatchObject({
      method: 'PATCH',
      url: '/messaging/session_1/business/collections/collection_1',
    })
  })

  test('rejects overlapping collection additions and removals before transport', async () => {
    server = await startHttpServer({body: {data: {}, success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'business collection update collection_1 --session session_1 --add-product product_1 --remove-product product_1 --json',
      ),
    )

    expect(exitCode(result.error)).toBe(2)
    expect(result.stderr).toContain('cannot both add and remove product_1')
    expect(server.requests).toHaveLength(0)
  })

  test('deletes, reorders, and appeals collections through exact operations', async () => {
    const input = await jsonInput('moves.json', {
      moves: [{collectionId: 'collection_1', fromIndex: 0, toIndex: 1}],
    })
    server = await startHttpSequenceServer([
      {body: {data: {success: true}, success: true}},
      {body: {data: {success: true}, success: true}},
      {body: {data: {success: true}, success: true}},
    ])

    const deleteResult = await apiKeyEnvironment(() =>
      runCommand(
        'business collection delete collection/1 --session session_1 --yes --idempotency-key collection_delete --json',
      ),
    )
    const reorderResult = await apiKeyEnvironment(() =>
      runCommand(
        `business collection reorder --session session_1 --input ${input} --idempotency-key collection_reorder --json`,
      ),
    )
    const appealResult = await apiKeyEnvironment(() =>
      runCommand(
        'business collection appeal collection/1 --session session_1 --reason "Please review" --idempotency-key collection_appeal --json',
      ),
    )

    expect(deleteResult.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/messaging/session_1/business/collections/collection%2F1',
    })
    expect(reorderResult.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      body: JSON.stringify({
        moves: [{collectionId: 'collection_1', fromIndex: 0, toIndex: 1}],
      }),
      method: 'POST',
      url: '/messaging/session_1/business/collections/reorder',
    })
    expect(appealResult.error).toBeUndefined()
    expect(server.requests[2]?.url).toBe(
      '/messaging/session_1/business/collections/collection%2F1/appeal',
    )
  })

  test('looks up one order with its exact event token', async () => {
    server = await startHttpServer({body: {data: order(), success: true}})

    const result = await apiKeyEnvironment(() =>
      runCommand(
        'business order view order/1 --session session/main --token event_token --idempotency-key order_lookup --json',
      ),
    )

    expect(result.error).toBeUndefined()
    expect(server.requests[0]).toMatchObject({
      body: JSON.stringify({token: 'event_token'}),
      method: 'POST',
      url: '/messaging/session%2Fmain/business/orders/order%2F1/lookup',
    })
  })

  test('views and completely replaces merchant compliance', async () => {
    const input = await jsonInput('compliance.json', compliance())
    server = await startHttpSequenceServer([
      {body: {data: compliance(), success: true}},
      {body: {data: compliance(), success: true}},
    ])

    const viewResult = await apiKeyEnvironment(() =>
      runCommand('business compliance view --session session_1 --json'),
    )
    const replaceResult = await apiKeyEnvironment(() =>
      runCommand(
        `business compliance replace --session session_1 --input ${input} --idempotency-key compliance_replace --json`,
      ),
    )

    expect(viewResult.error).toBeUndefined()
    expect(server.requests[0]?.url).toBe(
      '/messaging/session_1/business/compliance',
    )
    expect(replaceResult.error).toBeUndefined()
    expect(server.requests[1]).toMatchObject({
      body: JSON.stringify(compliance()),
      method: 'PUT',
      url: '/messaging/session_1/business/compliance',
    })
  })

  test.each([
    ['accounts view', 'linked-accounts'],
    ['eligibility view', 'eligibility'],
  ] as const)(
    '%s exposes the exact account inspection endpoint',
    async (command, endpoint) => {
      server = await startHttpServer({
        body: {
          data: endpoint === 'eligibility' ? {features: []} : {},
          success: true,
        },
      })

      const result = await apiKeyEnvironment(() =>
        runCommand(`business ${command} --session session_1 --json`),
      )

      expect(result.error).toBeUndefined()
      expect(server.requests[0]?.url).toBe(
        `/messaging/session_1/business/${endpoint}`,
      )
    },
  )

  async function jsonInput(name: string, value: unknown): Promise<string> {
    directory ??= await mkdtemp(join(tmpdir(), 'polymorfa-business-'))
    const path = join(directory, name)
    await writeFile(path, JSON.stringify(value))
    return path
  }

  async function apiKeyEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k',
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN: undefined,
      },
      run,
    )
  }

  async function clientTokenEnvironment<T>(run: () => Promise<T>): Promise<T> {
    if (server === undefined) throw new Error('Test server was not started.')
    return withEnvironment(
      {
        POLYMORFA_API_KEY: undefined,
        POLYMORFA_BASE_URL: server.baseUrl,
        POLYMORFA_CLIENT_TOKEN:
          'pmfa_ct_AQNtYzEzMzMzMzNDM4MzMzMzMzMzAAABoUcohAAAAA4QRERERERERESERERERERERAt0ZXN0LW51bWJlcgdicm93c2VyASIiIiIiIkIigiIiIiIiIiL__________wBTX4VcUmrk5uKjY5gnH00LcrWKw9eWe18PVEgJs1Z_49lLYduDasQEoXgU0QxV5mty5r5Q5M9IG6tYvCvbUIEO',
      },
      run,
    )
  }
})

function businessProfile() {
  return {
    address: '1 Example Street',
    categories: [{id: 'software', name: 'Software'}],
    coverPhotoId: 'cover_1',
    description: 'Tools for developers.',
    email: 'shop@example.com',
    hours: [],
    hoursTimeZone: 'Europe/Zurich',
    id: '750000000001',
    options: {},
    websites: ['https://example.com'],
  }
}

function productMutation(hidden: boolean) {
  return {
    currency: 'USD',
    hidden,
    images: [{url: 'https://example.com/product.jpg'}],
    name: 'Polymorfa plan',
    price: '19900',
  }
}

function product() {
  return {
    currency: 'USD',
    hidden: false,
    id: 'product_1',
    media: {images: [], videos: []},
    name: 'Polymorfa plan',
    price: '19900',
    sanctioned: false,
    status: {canAppeal: false},
  }
}

function collection() {
  return {
    id: 'collection_1',
    name: 'Featured',
    products: [],
    status: {canAppeal: false},
  }
}

function order() {
  return {
    createdAt: 1_787_212_800,
    id: 'order_1',
    price: {currency: 'USD', subtotal: '19900', total: '19900'},
    products: [],
  }
}

function compliance() {
  return {
    customerCare: {
      email: 'care@example.com',
      landlineNumber: '+15550000001',
      mobileNumber: '+15550000002',
    },
    entityName: 'Example LLC',
    entityType: 'LIMITED_LIABILITY_PARTNERSHIP',
    entityTypeCustom: '',
    grievanceOfficer: {
      email: 'officer@example.com',
      landlineNumber: '+15550000003',
      mobileNumber: '+15550000004',
      name: 'Alice Example',
    },
    isRegistered: true,
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as {oclif?: {exit?: number}} | undefined)?.oclif?.exit
}
