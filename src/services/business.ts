import {readFile, stat} from 'node:fs/promises'

import {
  PolymorfaConfigurationError,
  type AsyncAcceptedData,
  type BusinessActionSuccess,
  type BusinessCatalogAppealRequest,
  type BusinessCatalogPage,
  type BusinessCatalogParams,
  type BusinessCollection,
  type BusinessCollectionCreateRequest,
  type BusinessCollectionMutationResult,
  type BusinessCollectionPage,
  type BusinessCollectionParams,
  type BusinessCollectionReorderRequest,
  type BusinessCollectionsParams,
  type BusinessCollectionUpdateRequest,
  type BusinessCoverPhotoRequest,
  type BusinessCoverPhotoResult,
  type BusinessEligibility,
  type BusinessLinkedAccounts,
  type BusinessMerchantCompliance,
  type BusinessOrder,
  type BusinessProduct,
  type BusinessProductDeleteResult,
  type BusinessProductMutationRequest,
  type BusinessProductParams,
  type BusinessProfile,
  type BusinessProfileStatus,
  type BusinessProfileUpdateRequest,
  type MessagingClient,
  type RequestOptions,
  type ResponseMetadata,
} from '@polymorfa/sdk'

export const MAX_BUSINESS_COVER_BYTES = 5 * 1024 * 1024
export const MAX_BUSINESS_PRODUCT_IMAGE_BYTES = 16 * 1024 * 1024

export interface BusinessResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

type BusinessMutation<T> = T | AsyncAcceptedData

export async function viewOwnBusinessProfile(
  client: MessagingClient,
  session: string,
): Promise<BusinessResult<BusinessProfile>> {
  const response = await client.business.getProfile(session)
  return result(response.data.data, response.metadata)
}

export async function updateOwnBusinessProfile(
  client: MessagingClient,
  session: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessProfileStatus>>> {
  const response = await client.business.updateProfile(
    session,
    profileUpdate(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function setBusinessCoverPhoto(
  client: MessagingClient,
  session: string,
  source: {readonly file?: string; readonly url?: string},
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessCoverPhotoResult>>> {
  const response = await client.business.setCoverPhoto(
    session,
    await coverPhotoRequest(source),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function deleteBusinessCoverPhoto(
  client: MessagingClient,
  session: string,
  coverPhotoId: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessProfileStatus>>> {
  const response = await client.business.deleteCoverPhoto(
    session,
    coverPhotoId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewBusinessCatalog(
  client: MessagingClient,
  session: string,
  params: BusinessCatalogParams,
): Promise<BusinessResult<BusinessCatalogPage>> {
  const response = await client.business.getCatalog(session, params)
  return result(response.data.data, response.metadata)
}

export async function createBusinessCatalog(
  client: MessagingClient,
  session: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.createCatalog(session, options)
  return result(response.data.data, response.metadata)
}

export async function setBusinessCartEnabled(
  client: MessagingClient,
  session: string,
  enabled: boolean,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.setCartEnabled(
    session,
    {enabled},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewBusinessProduct(
  client: MessagingClient,
  session: string,
  productId: string,
  params: BusinessProductParams,
): Promise<BusinessResult<BusinessProduct>> {
  const response = await client.business.getProduct(session, productId, params)
  return result(response.data.data, response.metadata)
}

export async function createBusinessProduct(
  client: MessagingClient,
  session: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessProduct>>> {
  const response = await client.business.createProduct(
    session,
    await productMutation(input, false),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function replaceBusinessProduct(
  client: MessagingClient,
  session: string,
  productId: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessProduct>>> {
  const response = await client.business.updateProduct(
    session,
    productId,
    await productMutation(input, true),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function deleteBusinessProduct(
  client: MessagingClient,
  session: string,
  productId: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessProductDeleteResult>>> {
  const response = await client.business.deleteProduct(
    session,
    productId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function setBusinessProductVisibility(
  client: MessagingClient,
  session: string,
  productId: string,
  hidden: boolean,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.setProductVisibility(
    session,
    productId,
    {hidden},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function appealBusinessProduct(
  client: MessagingClient,
  session: string,
  productId: string,
  reason: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.appealProduct(
    session,
    productId,
    appeal(reason),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function listBusinessCollections(
  client: MessagingClient,
  session: string,
  params: BusinessCollectionsParams,
): Promise<BusinessResult<BusinessCollectionPage>> {
  const response = await client.business.listCollections(session, params)
  return result(response.data.data, response.metadata)
}

export async function viewBusinessCollection(
  client: MessagingClient,
  session: string,
  collectionId: string,
  params: BusinessCollectionParams,
): Promise<BusinessResult<BusinessCollection>> {
  const response = await client.business.getCollection(
    session,
    collectionId,
    params,
  )
  return result(response.data.data, response.metadata)
}

export async function createBusinessCollection(
  client: MessagingClient,
  session: string,
  input: BusinessCollectionCreateRequest,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessCollectionMutationResult>>> {
  validateCollectionCreate(input)
  const response = await client.business.createCollection(
    session,
    input,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function updateBusinessCollection(
  client: MessagingClient,
  session: string,
  collectionId: string,
  input: BusinessCollectionUpdateRequest,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessCollectionMutationResult>>> {
  validateCollectionUpdate(input)
  const response = await client.business.updateCollection(
    session,
    collectionId,
    input,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function deleteBusinessCollection(
  client: MessagingClient,
  session: string,
  collectionId: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.deleteCollection(
    session,
    collectionId,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function reorderBusinessCollections(
  client: MessagingClient,
  session: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.reorderCollections(
    session,
    collectionReorder(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function appealBusinessCollection(
  client: MessagingClient,
  session: string,
  collectionId: string,
  reason: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessActionSuccess>>> {
  const response = await client.business.appealCollection(
    session,
    collectionId,
    appeal(reason),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewBusinessOrder(
  client: MessagingClient,
  session: string,
  orderId: string,
  token: string,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessOrder>>> {
  if (token.length === 0) {
    throw new PolymorfaConfigurationError(
      'Order event token cannot be empty.',
      'token',
    )
  }
  const response = await client.business.getOrder(
    session,
    orderId,
    {token},
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewBusinessCompliance(
  client: MessagingClient,
  session: string,
): Promise<BusinessResult<BusinessMerchantCompliance>> {
  const response = await client.business.getMerchantCompliance(session)
  return result(response.data.data, response.metadata)
}

export async function replaceBusinessCompliance(
  client: MessagingClient,
  session: string,
  input: unknown,
  options: RequestOptions = {},
): Promise<BusinessResult<BusinessMutation<BusinessMerchantCompliance>>> {
  const response = await client.business.setMerchantCompliance(
    session,
    merchantCompliance(input),
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function viewBusinessLinkedAccounts(
  client: MessagingClient,
  session: string,
): Promise<BusinessResult<BusinessLinkedAccounts>> {
  const response = await client.business.getLinkedAccounts(session)
  return result(response.data.data, response.metadata)
}

export async function viewBusinessEligibility(
  client: MessagingClient,
  session: string,
): Promise<BusinessResult<BusinessEligibility>> {
  const response = await client.business.getEligibility(session)
  return result(response.data.data, response.metadata)
}

export function renderBusinessProfile(profile: BusinessProfile): string {
  return [
    row('JID', profile.jid),
    row('Address', profile.address),
    row('Email', profile.email),
    row('Description', profile.description),
    row('Cover photo', profile.coverPhotoId),
    row('Time zone', profile.hoursTimeZone),
    ...profile.websites.map((website) => row('Website', website)),
    ...profile.categories.map((category) => row('Category', category.name)),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderBusinessCatalog(page: BusinessCatalogPage): string {
  const products = renderBusinessProducts(page.products)
  return page.next === undefined
    ? products
    : `${products}\nNext cursor\t${page.next}`
}

export function renderBusinessProduct(product: BusinessProduct): string {
  return [
    row('Name', product.name),
    row('ID', product.id),
    row('Price', `${product.price} ${product.currency}`),
    row('Hidden', product.hidden ? 'yes' : 'no'),
    row('Sanctioned', product.sanctioned ? 'yes' : 'no'),
    row('Description', product.description),
    row('URL', product.url),
    row('Status', product.status.status),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderBusinessCollections(
  page: BusinessCollectionPage,
): string {
  const collections =
    page.collections.length === 0
      ? 'No business collections found.'
      : page.collections
          .map((collection) =>
            [
              collection.id,
              collection.name,
              `${collection.products.length} products`,
            ].join('\t'),
          )
          .join('\n')
  return page.next === undefined
    ? collections
    : `${collections}\nNext cursor\t${page.next}`
}

export function renderBusinessCollection(
  collection: BusinessCollection,
): string {
  return [
    row('Name', collection.name),
    row('ID', collection.id),
    row('Products', String(collection.products.length)),
    row('Status', collection.status.status),
    row('Can appeal', collection.status.canAppeal ? 'yes' : 'no'),
    row('Reject reason', collection.status.rejectReason),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderBusinessOrder(order: BusinessOrder): string {
  return [
    row('ID', order.id),
    row('Created', String(order.createdAt)),
    row('Catalog', order.catalogId),
    row('Subtotal', `${order.price.subtotal} ${order.price.currency}`),
    row('Total', `${order.price.total} ${order.price.currency}`),
    row('Products', String(order.products.length)),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderBusinessEligibility(
  eligibility: BusinessEligibility,
): string {
  if (eligibility.features.length === 0) return 'No business features found.'
  return eligibility.features
    .map((feature) => [feature.feature, feature.status].join('\t'))
    .join('\n')
}

export function renderBusinessMutation(
  data: unknown,
  completed: string,
): string {
  return isAsyncAccepted(data)
    ? `Accepted as request ${data.requestId}.`
    : completed
}

export function renderJson(value: unknown): string {
  return JSON.stringify(value, undefined, 2)
}

function profileUpdate(input: unknown): BusinessProfileUpdateRequest {
  const value = record(input, 'Business profile input must be a JSON object.')
  return value
}

async function productMutation(
  input: unknown,
  replacement: boolean,
): Promise<BusinessProductMutationRequest> {
  const value = record(input, 'Business product input must be a JSON object.')
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Business product input requires a non-empty name.',
      'input',
    )
  }
  if (!Array.isArray(value.images) || value.images.length === 0) {
    throw new PolymorfaConfigurationError(
      'Business product input requires at least one image source.',
      'input',
    )
  }
  if (value.images.length > 10) {
    throw new PolymorfaConfigurationError(
      'Business product input cannot contain more than 10 images.',
      'input',
    )
  }
  const images = await Promise.all(value.images.map(productImage))
  if (Array.isArray(value.videoUrls) && value.videoUrls.length > 10) {
    throw new PolymorfaConfigurationError(
      'Business product input cannot contain more than 10 video URLs.',
      'input',
    )
  }
  validateProductPrice(value)
  if (replacement && typeof value.hidden !== 'boolean') {
    throw new PolymorfaConfigurationError(
      'Replacement product input must explicitly include hidden because omission unhides the product upstream.',
      'input',
    )
  }
  return {...value, images} as unknown as BusinessProductMutationRequest
}

async function productImage(
  input: unknown,
): Promise<Readonly<Record<string, string>>> {
  const value = record(
    input,
    'Each business product image must be a JSON object.',
  )
  const sources = ['url', 'base64', 'mediaUrl', 'file'].filter(
    (key) => typeof value[key] === 'string' && value[key].length > 0,
  )
  if (sources.length !== 1) {
    throw new PolymorfaConfigurationError(
      'Each business product image must provide exactly one of url, base64, mediaUrl, or file.',
      'input',
    )
  }
  if (sources[0] !== 'file') {
    return value as Readonly<Record<string, string>>
  }

  const file = value.file as string
  const size = (await stat(file)).size
  enforceProductImageLimit(size, file)
  const bytes = await readFile(file)
  enforceProductImageLimit(bytes.byteLength, file)
  return {base64: bytes.toString('base64')}
}

function validateProductPrice(value: Readonly<Record<string, unknown>>): void {
  if (value.price === undefined) {
    if (value.currency !== undefined || value.salePrice !== undefined) {
      throw new PolymorfaConfigurationError(
        'Business product currency and salePrice require price.',
        'input',
      )
    }
    return
  }
  if (typeof value.price !== 'string' || !/^\d{1,18}$/.test(value.price)) {
    throw new PolymorfaConfigurationError(
      'Business product price must be a decimal string of at most 18 digits in thousandths.',
      'input',
    )
  }
  if (
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency)
  ) {
    throw new PolymorfaConfigurationError(
      'Business product currency must be a three-letter uppercase code when price is present.',
      'input',
    )
  }
  if (
    value.salePrice !== undefined &&
    (typeof value.salePrice !== 'string' || !/^\d{1,18}$/.test(value.salePrice))
  ) {
    throw new PolymorfaConfigurationError(
      'Business product salePrice must be a decimal string of at most 18 digits in thousandths.',
      'input',
    )
  }
}

function validateCollectionCreate(
  input: BusinessCollectionCreateRequest,
): void {
  if (input.name.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Business collection name cannot be empty.',
      'name',
    )
  }
  validateUniqueIds(input.productIds, 'product', 1, 100)
}

function validateCollectionUpdate(
  input: BusinessCollectionUpdateRequest,
): void {
  if (
    input.name === undefined &&
    input.addProductIds === undefined &&
    input.removeProductIds === undefined
  ) {
    throw new PolymorfaConfigurationError(
      'Provide --name, --add-product, or --remove-product.',
      'collection',
    )
  }
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Business collection name cannot be empty.',
      'name',
    )
  }
  if (input.addProductIds !== undefined) {
    validateUniqueIds(input.addProductIds, 'add-product', 1, 100)
  }
  if (input.removeProductIds !== undefined) {
    validateUniqueIds(input.removeProductIds, 'remove-product', 1, 100)
  }
  const removed = new Set(input.removeProductIds ?? [])
  const overlap = (input.addProductIds ?? []).find((id) => removed.has(id))
  if (overlap !== undefined) {
    throw new PolymorfaConfigurationError(
      `A collection update cannot both add and remove ${overlap}.`,
      'collection',
    )
  }
}

function collectionReorder(input: unknown): BusinessCollectionReorderRequest {
  const value = record(
    input,
    'Business collection reorder input must be a JSON object.',
  )
  if (
    !Array.isArray(value.moves) ||
    value.moves.length < 1 ||
    value.moves.length > 100
  ) {
    throw new PolymorfaConfigurationError(
      'Business collection reorder input requires 1 through 100 moves.',
      'input',
    )
  }
  const ids: string[] = []
  for (const move of value.moves) {
    const item = record(move, 'Each collection move must be a JSON object.')
    if (
      typeof item.collectionId !== 'string' ||
      item.collectionId.length === 0
    ) {
      throw new PolymorfaConfigurationError(
        'Each collection move requires collectionId.',
        'input',
      )
    }
    for (const key of ['fromIndex', 'toIndex'] as const) {
      if (
        !Number.isInteger(item[key]) ||
        (item[key] as number) < 0 ||
        (item[key] as number) > 99
      ) {
        throw new PolymorfaConfigurationError(
          `Each collection move ${key} must be an integer from 0 through 99.`,
          'input',
        )
      }
    }
    ids.push(item.collectionId)
  }
  validateUniqueIds(ids, 'collection move', 1, 100)
  return value as unknown as BusinessCollectionReorderRequest
}

function merchantCompliance(input: unknown): BusinessMerchantCompliance {
  const value = record(
    input,
    'Business compliance input must be a JSON object.',
  )
  for (const key of ['entityName', 'entityType', 'entityTypeCustom'] as const) {
    if (typeof value[key] !== 'string') {
      throw new PolymorfaConfigurationError(
        `Business compliance input requires string ${key}.`,
        'input',
      )
    }
  }
  if (typeof value.isRegistered !== 'boolean') {
    throw new PolymorfaConfigurationError(
      'Business compliance input requires boolean isRegistered.',
      'input',
    )
  }
  validateMerchantContact(value.customerCare, false)
  validateMerchantContact(value.grievanceOfficer, true)
  return value as unknown as BusinessMerchantCompliance
}

function validateMerchantContact(input: unknown, officer: boolean): void {
  const value = record(
    input,
    `Business compliance input requires ${officer ? 'grievanceOfficer' : 'customerCare'}.`,
  )
  for (const key of [
    ...(officer ? (['name'] as const) : []),
    'email',
    'landlineNumber',
    'mobileNumber',
  ] as const) {
    if (typeof value[key] !== 'string') {
      throw new PolymorfaConfigurationError(
        `Business compliance contact requires string ${key}.`,
        'input',
      )
    }
  }
}

function appeal(reason: string): BusinessCatalogAppealRequest {
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    throw new PolymorfaConfigurationError(
      'Business appeal reason cannot be empty.',
      'reason',
    )
  }
  if (Buffer.byteLength(trimmed, 'utf8') > 4096) {
    throw new PolymorfaConfigurationError(
      'Business appeal reason cannot exceed 4096 UTF-8 bytes.',
      'reason',
    )
  }
  return {reason: trimmed}
}

async function coverPhotoRequest(source: {
  readonly file?: string
  readonly url?: string
}): Promise<BusinessCoverPhotoRequest> {
  if (source.file === undefined && source.url === undefined) {
    throw new PolymorfaConfigurationError(
      'Provide exactly one of --file or --url.',
      'coverPhoto',
    )
  }
  if (source.file !== undefined && source.url !== undefined) {
    throw new PolymorfaConfigurationError(
      '--file cannot also be provided with --url.',
      'coverPhoto',
    )
  }
  if (source.url !== undefined) return {url: source.url}

  const size = (await stat(source.file!)).size
  enforceCoverLimit(size, source.file!)
  const bytes = await readFile(source.file!)
  enforceCoverLimit(bytes.byteLength, source.file!)
  return {base64: bytes.toString('base64')}
}

function enforceCoverLimit(size: number, file: string): void {
  if (size <= MAX_BUSINESS_COVER_BYTES) return
  throw new PolymorfaConfigurationError(
    `${file} is ${size} bytes and exceeds the ${MAX_BUSINESS_COVER_BYTES} byte business cover-photo limit.`,
    'file',
  )
}

function enforceProductImageLimit(size: number, file: string): void {
  if (size <= MAX_BUSINESS_PRODUCT_IMAGE_BYTES) return
  throw new PolymorfaConfigurationError(
    `${file} is ${size} bytes and exceeds the ${MAX_BUSINESS_PRODUCT_IMAGE_BYTES} byte business product-image limit.`,
    'file',
  )
}

function validateUniqueIds(
  values: readonly string[],
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (values.length < minimum || values.length > maximum) {
    throw new PolymorfaConfigurationError(
      `${label} values must contain ${minimum} through ${maximum} entries.`,
      label,
    )
  }
  const unique = new Set(values)
  if (unique.size !== values.length) {
    throw new PolymorfaConfigurationError(
      `${label} values must be unique.`,
      label,
    )
  }
  if (values.some((value) => value.length === 0)) {
    throw new PolymorfaConfigurationError(
      `${label} values cannot be empty.`,
      label,
    )
  }
}

function renderBusinessProducts(products: readonly BusinessProduct[]): string {
  if (products.length === 0) return 'No business products found.'
  return products
    .map((product) =>
      [product.id, product.name, `${product.price} ${product.currency}`].join(
        '\t',
      ),
    )
    .join('\n')
}

function row(label: string, value: string | undefined): string | undefined {
  return value === undefined || value.length === 0
    ? undefined
    : `${label}\t${value}`
}

function record(
  value: unknown,
  message: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PolymorfaConfigurationError(message, 'input')
  }
  return value as Readonly<Record<string, unknown>>
}

function isAsyncAccepted(value: unknown): value is AsyncAcceptedData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requestId' in value &&
    typeof value.requestId === 'string'
  )
}

function result<T>(data: T, metadata: ResponseMetadata): BusinessResult<T> {
  return {
    data,
    metadata: {
      attempts: metadata.attempts,
      status: metadata.status,
      ...(metadata.apiVersion === undefined
        ? {}
        : {apiVersion: metadata.apiVersion}),
      ...(metadata.requestId === undefined
        ? {}
        : {requestId: metadata.requestId}),
    },
  }
}
