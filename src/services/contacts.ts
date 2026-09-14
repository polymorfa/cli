import {
  type BusinessProfile,
  type CheckContactResult,
  type Contact,
  type ContactBlocklist,
  type ContactProfilePicture,
  type ContactUserInfo,
  type MessagingClient,
  type RequestOptions,
  type ResponseMetadata,
  type SuccessResponse,
} from '@polymorfa/sdk'

export interface ContactResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export async function listContacts(
  client: MessagingClient,
  session: string,
): Promise<ContactResult<readonly Contact[]>> {
  const response = await client.contacts.list(session)
  return result(response.data.data, response.metadata)
}

export async function checkContacts(
  client: MessagingClient,
  session: string,
  phones: readonly string[],
): Promise<ContactResult<readonly CheckContactResult[]>> {
  const response = await client.contacts.check(session, phones)
  return result(response.data.data, response.metadata)
}

export async function viewContact(
  client: MessagingClient,
  session: string,
  contact: string,
): Promise<ContactResult<Contact>> {
  const response = await client.contacts.retrieve(session, contact)
  return result(response.data.data, response.metadata)
}

export async function viewContactPicture(
  client: MessagingClient,
  session: string,
  contact: string,
): Promise<ContactResult<ContactProfilePicture>> {
  const response = await client.contacts.picture(session, contact)
  return result(response.data.data, response.metadata)
}

export async function viewContactInfo(
  client: MessagingClient,
  session: string,
  contact: string,
): Promise<ContactResult<ContactUserInfo>> {
  const response = await client.contacts.info(session, contact)
  return result(response.data.data, response.metadata)
}

export async function listContactDevices(
  client: MessagingClient,
  session: string,
  contact: string,
): Promise<ContactResult<readonly string[]>> {
  const response = await client.contacts.devices(session, contact)
  return result(response.data.data, response.metadata)
}

export async function viewContactBusinessProfile(
  client: MessagingClient,
  session: string,
  contact: string,
): Promise<ContactResult<BusinessProfile>> {
  const response = await client.contacts.businessProfile(session, contact)
  return result(response.data.data, response.metadata)
}

export async function viewContactBlocklist(
  client: MessagingClient,
  session: string,
): Promise<ContactResult<ContactBlocklist>> {
  const response = await client.contacts.blocklist(session)
  return result(response.data.data, response.metadata)
}

export async function blockContact(
  client: MessagingClient,
  session: string,
  contact: string,
  options: RequestOptions = {},
): Promise<ContactResult<SuccessResponse>> {
  const response = await client.contacts.block(session, contact, options)
  return result(response.data, response.metadata)
}

export async function unblockContact(
  client: MessagingClient,
  session: string,
  contact: string,
  options: RequestOptions = {},
): Promise<ContactResult<SuccessResponse>> {
  const response = await client.contacts.unblock(session, contact, options)
  return result(response.data, response.metadata)
}

export function renderContacts(contacts: readonly Contact[]): string {
  if (contacts.length === 0) return 'No contacts found.'
  return contacts
    .map((contact) =>
      [contact.id, contact.name, contact.phoneNumber, contact.businessName]
        .filter((value): value is string => value !== undefined)
        .join('\t'),
    )
    .join('\n')
}

export function renderContact(contact: Contact): string {
  return [
    row('Name', contact.name),
    row('Push name', contact.pushName),
    row('Business name', contact.businessName),
    row('BSUID', contact.bsuid),
    row('ID', contact.id),
    row('Phone', contact.phoneNumber),
    row('Username', contact.username),
    row('Picture', contact.profileUrl),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderContactChecks(
  checks: readonly CheckContactResult[],
): string {
  return checks
    .map((check) =>
      [
        check.phoneNumber ?? check.id ?? 'unknown',
        check.exists ? 'registered' : 'not registered',
        check.id,
      ]
        .filter((value): value is string => value !== undefined)
        .join('\t'),
    )
    .join('\n')
}

export function renderContactInfo(info: ContactUserInfo): string {
  return [
    row('BSUID', info.bsuid),
    row('ID', info.id),
    row('Phone', info.phoneNumber),
    row('Username', info.username),
    row('Status', info.status),
    row('Picture ID', info.pictureId),
    row('Verified name', info.verifiedName),
    ...info.devices.map((device) => `Device\t${device.id}\t${device.device}`),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderBusinessProfile(profile: BusinessProfile): string {
  return [
    row('ID', profile.id),
    row('BSUID', profile.bsuid),
    row('Description', profile.description),
    row('Address', profile.address),
    row('Email', profile.email),
    row('Cover photo ID', profile.coverPhotoId),
    row('Hours time zone', profile.hoursTimeZone),
    ...profile.categories.map((category) => `Category\t${category.name}`),
    ...profile.websites.map((website) => `Website\t${website}`),
    ...Object.entries(profile.options).map(
      ([name, value]) => `Option ${name}\t${value}`,
    ),
    ...profile.hours.map(
      (hours) =>
        `Hours ${hours.dayOfWeek}\t${hours.mode}\t${hours.openTime}-${hours.closeTime}`,
    ),
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function renderBlocklist(blocklist: ContactBlocklist): string {
  return [
    `Hash\t${blocklist.hash}`,
    ...blocklist.contacts.map((contact) => `Blocked\t${contact.id}`),
  ].join('\n')
}

function row(label: string, value: string | undefined) {
  return value === undefined || value.length === 0
    ? undefined
    : `${label}\t${value}`
}

function result<T>(data: T, metadata: ResponseMetadata): ContactResult<T> {
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
