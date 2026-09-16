import {
  type CreateCustomerPairingLinkRequest,
  type CreateCustomerRequest,
  type CreatedCustomerPairingLink,
  type Customer,
  type CustomerEvent,
  type CustomerListEnvelope,
  type CustomerNumber,
  type CustomerPairingLink,
  type CustomerProjectRequest,
  type CustomersEnablement,
  type CustomersStatus,
  type ListCustomerEventsParams,
  type ListCustomersParams,
  type Client as PlatformClient,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type RequestOptions,
  type ResponseMetadata,
  type TransferCustomerNumberRequest,
  type UpdateCustomerRequest,
} from '@polymorfa/sdk'

export interface CustomerResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export function requireCustomerProject(projectId?: string): string {
  if (projectId === undefined || projectId.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Provide --project with the project ID for this Customer operation.',
      'project',
    )
  }
  return projectId
}

export async function customerStatus(
  client: PlatformClient,
  projectId: string,
): Promise<CustomerResult<CustomersStatus>> {
  const response = await client.customers.status(projectId)
  return result(response.data.data, response.metadata)
}

export async function enableCustomers(
  client: PlatformClient,
  projectId: string,
  options: RequestOptions,
): Promise<CustomerResult<CustomersEnablement>> {
  const response = await client.customers.enable(projectId, options)
  return result(response.data.data, response.metadata)
}

export async function listCustomers(
  client: PlatformClient,
  params: ListCustomersParams,
): Promise<CustomerResult<CustomerListEnvelope>> {
  const response = await client.customers.list(params)
  return result(response.data, response.metadata)
}

export async function createCustomer(
  client: PlatformClient,
  body: CreateCustomerRequest,
  options: RequestOptions,
): Promise<CustomerResult<Customer>> {
  const response = await client.customers.create(body, options)
  return result(response.data.data, response.metadata)
}

export async function viewCustomer(
  client: PlatformClient,
  customerId: string,
  projectId: string,
): Promise<CustomerResult<Customer>> {
  const response = await client.customers.retrieve(customerId, projectId)
  return result(response.data.data, response.metadata)
}

export async function updateCustomer(
  client: PlatformClient,
  customerId: string,
  body: UpdateCustomerRequest,
): Promise<CustomerResult<Customer>> {
  if (body.name === undefined && body.externalCustomerId === undefined) {
    throw new PolymorfaValidationError(
      'Provide at least one Customer profile field to update.',
      {code: 'missing_customer_update'},
    )
  }
  const response = await client.customers.update(customerId, body)
  return result(response.data.data, response.metadata)
}

export async function archiveCustomer(
  client: PlatformClient,
  customerId: string,
  body: CustomerProjectRequest,
  options: RequestOptions,
): Promise<CustomerResult<Customer>> {
  const response = await client.customers.archive(customerId, body, options)
  return result(response.data.data, response.metadata)
}

export async function restoreCustomer(
  client: PlatformClient,
  customerId: string,
  body: CustomerProjectRequest,
  options: RequestOptions,
): Promise<CustomerResult<Customer>> {
  const response = await client.customers.restore(customerId, body, options)
  return result(response.data.data, response.metadata)
}

export async function listCustomerNumbers(
  client: PlatformClient,
  customerId: string,
  projectId: string,
): Promise<CustomerResult<readonly CustomerNumber[]>> {
  const response = await client.customers.listNumbers(customerId, projectId)
  return result(response.data.data, response.metadata)
}

export async function listCustomerEvents(
  client: PlatformClient,
  customerId: string,
  params: ListCustomerEventsParams,
): Promise<CustomerResult<readonly CustomerEvent[]>> {
  const response = await client.customers.listEvents(customerId, params)
  return result(response.data.data, response.metadata)
}

export async function createCustomerPairingLink(
  client: PlatformClient,
  customerId: string,
  body: CreateCustomerPairingLinkRequest,
  options: RequestOptions,
): Promise<CustomerResult<CreatedCustomerPairingLink>> {
  const response = await client.customers.createPairingLink(
    customerId,
    body,
    options,
  )
  return result(response.data.data, response.metadata)
}

export async function listCustomerPairingLinks(
  client: PlatformClient,
  customerId: string,
  projectId: string,
): Promise<CustomerResult<readonly CustomerPairingLink[]>> {
  const response = await client.customers.listPairingLinks(
    customerId,
    projectId,
  )
  return result(response.data.data, response.metadata)
}

export async function revokeCustomerPairingLink(
  client: PlatformClient,
  customerId: string,
  pairingLinkId: string,
  projectId: string,
): Promise<CustomerResult<CustomerPairingLink>> {
  const response = await client.customers.revokePairingLink(
    customerId,
    pairingLinkId,
    projectId,
  )
  return result(response.data.data, response.metadata)
}

export async function transferCustomerNumber(
  client: PlatformClient,
  customerId: string,
  sessionId: string,
  body: TransferCustomerNumberRequest,
  options: RequestOptions,
): Promise<CustomerResult<CustomerNumber>> {
  const response = await client.customers.transferNumber(
    customerId,
    sessionId,
    body,
    options,
  )
  return result(response.data.data, response.metadata)
}

export function renderCustomers(customers: CustomerListEnvelope): string {
  if (customers.data.length === 0) return 'No Customers found.'
  return customers.data
    .map((customer) =>
      [
        customer.id,
        customer.name ?? '',
        customer.externalCustomerId ?? '',
        customer.status,
        `${customer.connectedNumberCount}/${customer.numberCount} connected`,
        customer.needsAttention ? 'needs attention' : '',
      ].join('\t'),
    )
    .join('\n')
}

export function renderCustomer(customer: Customer): string {
  return [
    `ID\t${customer.id}`,
    `Name\t${customer.name ?? ''}`,
    `External ID\t${customer.externalCustomerId ?? ''}`,
    `Status\t${customer.status}`,
    `Default\t${customer.isDefault}`,
  ].join('\n')
}

export function renderCustomerStatus(status: CustomersStatus): string {
  return status.enabled
    ? `Customers is enabled. Default Customer: ${status.defaultCustomer?.id ?? 'unknown'}.`
    : 'Customers is not enabled for this project.'
}

export function renderCustomerNumbers(
  numbers: readonly CustomerNumber[],
): string {
  if (numbers.length === 0) return 'No Numbers are assigned to this Customer.'
  return numbers
    .map((number) =>
      [
        number.sessionId,
        number.name ?? '',
        number.phoneMasked ?? '',
        number.status,
      ].join('\t'),
    )
    .join('\n')
}

export function renderCustomerEvents(events: readonly CustomerEvent[]): string {
  if (events.length === 0) return 'No Customer events found.'
  return events
    .map((event) =>
      [new Date(event.occurredAt).toISOString(), event.action, event.id].join(
        '\t',
      ),
    )
    .join('\n')
}

export function renderCustomerPairingLinks(
  links: readonly CustomerPairingLink[],
): string {
  if (links.length === 0) return 'No pairing links found.'
  return links
    .map((link) =>
      [
        link.id,
        link.status,
        link.methods.join(','),
        new Date(link.expiresAt).toISOString(),
      ].join('\t'),
    )
    .join('\n')
}

export function renderCreatedPairingLink(
  link: CreatedCustomerPairingLink,
): string {
  return link.url === null
    ? `Pairing link ${link.id} already exists. Its one-time URL is no longer available.`
    : link.url
}

function result<T>(data: T, metadata: ResponseMetadata): CustomerResult<T> {
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
