import {open, readFile, stat, writeFile} from 'node:fs/promises'
import {extname, resolve} from 'node:path'
import type {Readable} from 'node:stream'

import {
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaTimeoutError,
  type ResponseMetadata,
} from '@polymorfa/sdk'

import {CliConditionError} from '../errors/conditions.js'
import {readSecretFromStdin} from '../input/stdin.js'
import {
  VOICE_AUDIO_MAX_UPLOAD_BYTES,
  type VoiceAudioAsset,
  type VoiceAudioPreview,
  type VoiceClient,
  type VoiceProviderCredential,
  type VoiceResourceDeleted,
} from '../sdk/voice.js'

export interface VoiceResult<T> {
  readonly data: T
  readonly metadata: {
    readonly apiVersion?: string
    readonly attempts: number
    readonly requestId?: string
    readonly status: number
  }
}

export interface VoiceListResult<T> extends VoiceResult<readonly T[]> {
  readonly page: {readonly hasMore: boolean; readonly nextCursor: string | null}
}

export const BETA_NOTICE =
  'Voice Automation is a beta (calls.voice-automation) for enrolled teams only; other teams get voice_not_enabled (exit code 6).'

/** File extensions the CLI uploads, and the content type it sends for each. */
export const UPLOAD_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.m4a': 'audio/x-m4a',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
}

export const DEFAULT_PROVIDER_KEY_ENV = 'POLYMORFA_VOICE_PROVIDER_KEY'
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 120
export const WAIT_INTERVAL_MS = 2_000
export const MAX_PREVIEW_BYTES = 32 * 1024 * 1024

const MAX_NAME_LENGTH = 100
const MAX_TTS_TEXT = 5_000
const MAX_OPENAI_TTS_TEXT = 4_096
const MAX_TEXT_FILE_BYTES = 64 * 1024
const MAX_PROVIDER_KEY_LENGTH = 512
const ELEVENLABS_VOICE_ID = /^[A-Za-z0-9]{1,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Validation ─────────────────────────────────────────────────────────────

export function requireVoiceProject(projectId?: string): string {
  if (projectId === undefined || projectId.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      'Provide --project with the project ID that owns the audio library.',
      'project',
    )
  }
  return projectId.trim()
}

export function validateVoiceId(value: string, label: string): string {
  const trimmed = value.trim()
  if (!UUID.test(trimmed)) {
    throw new PolymorfaConfigurationError(`${label} must be a UUID.`, label)
  }
  return trimmed
}

export function validateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new PolymorfaConfigurationError(
      `--name must be 1 to ${MAX_NAME_LENGTH} characters.`,
      'name',
    )
  }
  return trimmed
}

/** Parse `--retention-days`: a whole number 1 to 3650, or `none` when allowed. */
export function parseRetentionDays(
  value: string,
  allowNone: boolean,
): number | null {
  const trimmed = value.trim().toLowerCase()
  if (allowNone && trimmed === 'none') return null
  const days = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new PolymorfaConfigurationError(
      allowNone
        ? '--retention-days must be a whole number from 1 to 3650, or none to keep the audio until it is deleted.'
        : '--retention-days must be a whole number from 1 to 3650.',
      'retention-days',
    )
  }
  return days
}

export function uploadContentType(path: string): string {
  const extension = extname(path).toLowerCase()
  const contentType = UPLOAD_CONTENT_TYPES[extension]
  if (contentType === undefined) {
    throw new PolymorfaConfigurationError(
      `Unsupported audio file type ${extension === '' ? '(no extension)' : extension}. Upload .mp3, .wav, .ogg, .opus, .m4a or .mp4.`,
      'file',
    )
  }
  return contentType
}

/** Read an upload after checking its type and size, before any request. */
export async function readUploadFile(path: string): Promise<{
  readonly bytes: Uint8Array
  readonly contentType: string
}> {
  const contentType = uploadContentType(path)
  const absolute = resolve(path)
  const info = await stat(absolute).catch((error: unknown) => {
    throw new PolymorfaConfigurationError(
      `Cannot read ${path}: ${nodeErrorCode(error) ?? 'unknown error'}.`,
      'file',
    )
  })
  if (!info.isFile()) {
    throw new PolymorfaConfigurationError(`${path} is not a file.`, 'file')
  }
  assertUploadSize(info.size, path)
  const bytes = new Uint8Array(await readFile(absolute))
  // The file may have changed between stat and read.
  assertUploadSize(bytes.byteLength, path)
  return {bytes, contentType}
}

function assertUploadSize(size: number, path: string): void {
  if (size === 0) {
    throw new PolymorfaConfigurationError(`${path} is empty.`, 'file')
  }
  if (size > VOICE_AUDIO_MAX_UPLOAD_BYTES) {
    throw new PolymorfaConfigurationError(
      `${path} is ${size} bytes; audio uploads are limited to 16 MB (${VOICE_AUDIO_MAX_UPLOAD_BYTES} bytes).`,
      'file',
    )
  }
}

export function validateTtsText(text: string, provider: string): string {
  const limit = provider === 'openai' ? MAX_OPENAI_TTS_TEXT : MAX_TTS_TEXT
  if (text.trim().length === 0 || text.length > limit) {
    throw new PolymorfaConfigurationError(
      `The text must be 1 to ${limit} characters for ${provider}.`,
      'text',
    )
  }
  return text
}

export function validateTtsVoice(voice: string, provider: string): string {
  const trimmed = voice.trim()
  if (provider === 'elevenlabs' && !ELEVENLABS_VOICE_ID.test(trimmed)) {
    throw new PolymorfaConfigurationError(
      '--voice must be an ElevenLabs voice ID: 1 to 64 letters and digits.',
      'voice',
    )
  }
  if (trimmed.length === 0) {
    throw new PolymorfaConfigurationError('--voice is required.', 'voice')
  }
  return trimmed
}

/** Read `--text-file`: a path, or `-` for standard input. */
export async function readTextFile(
  path: string,
  input: Readable = process.stdin,
): Promise<string> {
  if (path === '-') {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      bytes += buffer.byteLength
      if (bytes > MAX_TEXT_FILE_BYTES) throw textTooLarge()
      chunks.push(buffer)
    }
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '')
  }
  const handle = await open(resolve(path), 'r').catch((error: unknown) => {
    throw new PolymorfaConfigurationError(
      `Cannot read ${path}: ${nodeErrorCode(error) ?? 'unknown error'}.`,
      'text-file',
    )
  })
  try {
    const info = await handle.stat()
    if (info.size > MAX_TEXT_FILE_BYTES) throw textTooLarge()
    return (await handle.readFile('utf8')).replace(/\r?\n$/, '')
  } finally {
    await handle.close()
  }
}

function textTooLarge(): PolymorfaConfigurationError {
  return new PolymorfaConfigurationError(
    '--text-file exceeded 64 KiB.',
    'text-file',
  )
}

// ── Provider key input ─────────────────────────────────────────────────────

export interface ProviderKeySource {
  readonly env: Readonly<Record<string, string | undefined>>
  /** Name of the environment variable given with --key-env, if any. */
  readonly keyEnv?: string | undefined
  readonly stdin: Readable & {readonly isTTY?: boolean}
}

/**
 * Read a provider key without ever taking it from a command argument. The
 * environment variable wins when it is set (by default
 * POLYMORFA_VOICE_PROVIDER_KEY); otherwise the key is read from piped
 * standard input. An explicitly named variable that is empty is an error, and
 * a terminal is refused so the key is never echoed.
 */
export async function readProviderKey(
  source: ProviderKeySource,
): Promise<string> {
  const name = source.keyEnv ?? DEFAULT_PROVIDER_KEY_ENV
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new PolymorfaConfigurationError(
      '--key-env must name an environment variable.',
      'key-env',
    )
  }
  const fromEnv = source.env[name]?.trim()
  let key: string
  if (fromEnv !== undefined && fromEnv.length > 0) {
    key = fromEnv
  } else if (source.keyEnv !== undefined) {
    throw new PolymorfaConfigurationError(
      `Environment variable ${name} is not set.`,
      'key-env',
    )
  } else if (source.stdin.isTTY === true) {
    throw new PolymorfaConfigurationError(
      `Pipe the provider key on standard input or set ${DEFAULT_PROVIDER_KEY_ENV}; the key is never read from an argument or typed at a visible prompt.`,
      'key',
    )
  } else {
    key = await readSecretFromStdin(source.stdin)
  }
  if (key.length > MAX_PROVIDER_KEY_LENGTH) {
    throw new PolymorfaConfigurationError(
      `The provider key must be 1 to ${MAX_PROVIDER_KEY_LENGTH} characters.`,
      'key',
    )
  }
  return key
}

// ── Operations ─────────────────────────────────────────────────────────────

export interface WaitOptions {
  readonly intervalMs?: number
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly timeoutSeconds: number
}

export async function uploadAudio(
  client: VoiceClient,
  input: {
    readonly bytes: Uint8Array
    readonly contentType: string
    readonly name: string
    readonly projectId: string
    readonly retentionDays?: number
  },
): Promise<VoiceResult<VoiceAudioAsset>> {
  const created = await client.createAudioUpload({
    contentType: input.contentType,
    name: input.name,
    projectId: input.projectId,
    sizeBytes: input.bytes.byteLength,
    ...(input.retentionDays === undefined
      ? {}
      : {retentionDays: input.retentionDays}),
  })
  await client.sendToUploadUrl(created.data.upload, input.bytes)
  const completed = await client.completeAudio(created.data.asset.id)
  return result(completed.data, completed.metadata)
}

export async function synthesizeAudio(
  client: VoiceClient,
  input: Parameters<VoiceClient['synthesizeAudio']>[0],
): Promise<VoiceResult<VoiceAudioAsset>> {
  const response = await client.synthesizeAudio(input)
  return result(response.data, response.metadata)
}

/**
 * Read the asset until it is ready or failed. A failed asset exits with
 * voice_asset_failed (exit code 13) so scripts can tell it from success.
 */
export async function waitForAudio(
  client: VoiceClient,
  asset: VoiceResult<VoiceAudioAsset>,
  options: WaitOptions,
): Promise<VoiceResult<VoiceAudioAsset>> {
  const intervalMs = options.intervalMs ?? WAIT_INTERVAL_MS
  const sleep = options.sleep ?? defaultSleep
  const deadline = Date.now() + options.timeoutSeconds * 1000
  let current = asset
  // Like the SDK's waitUntilReady: read first, then sleep between reads.
  while (current.data.status !== 'ready' && current.data.status !== 'failed') {
    const response = await client.retrieveAudio(current.data.id)
    current = result(response.data, response.metadata)
    if (current.data.status === 'ready' || current.data.status === 'failed') {
      break
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new PolymorfaTimeoutError(
        `Audio ${current.data.id} was still ${current.data.status} after ${options.timeoutSeconds}s. Check it later with polymorfa voice audio view ${current.data.id}.`,
        {code: 'request_timeout'},
      )
    }
    await sleep(Math.min(intervalMs, remaining))
  }
  if (current.data.status === 'failed') {
    throw new CliConditionError(
      'voice_asset_failed',
      `Audio ${current.data.id} failed: ${current.data.failureReason ?? 'unknown reason'}.`,
    )
  }
  return current
}

export async function listAudio(
  client: VoiceClient,
  params: Parameters<VoiceClient['listAudio']>[0],
): Promise<VoiceListResult<VoiceAudioAsset>> {
  const response = await client.listAudio(params)
  return listResult(response.data, response.metadata)
}

export async function viewAudio(
  client: VoiceClient,
  assetId: string,
): Promise<VoiceResult<VoiceAudioAsset>> {
  const response = await client.retrieveAudio(validateVoiceId(assetId, 'asset'))
  return result(response.data, response.metadata)
}

export async function updateAudio(
  client: VoiceClient,
  assetId: string,
  input: {
    readonly expectedRevision?: number | undefined
    readonly name?: string | undefined
    readonly retentionDays?: number | null | undefined
  },
): Promise<VoiceResult<VoiceAudioAsset>> {
  if (input.name === undefined && input.retentionDays === undefined) {
    throw new PolymorfaConfigurationError(
      'Provide --name or --retention-days with the change to make.',
      'name',
    )
  }
  const response = await client.updateAudio(validateVoiceId(assetId, 'asset'), {
    ...(input.expectedRevision === undefined
      ? {}
      : {expectedRevision: input.expectedRevision}),
    ...(input.name === undefined ? {} : {name: validateName(input.name)}),
    ...(input.retentionDays === undefined
      ? {}
      : {retentionDays: input.retentionDays}),
  })
  return result(response.data, response.metadata)
}

export async function deleteAudio(
  client: VoiceClient,
  assetId: string,
): Promise<VoiceResult<VoiceResourceDeleted>> {
  const response = await client.deleteAudio(assetId)
  return result(response.data, response.metadata)
}

export interface PreviewResult {
  readonly preview: VoiceAudioPreview
  readonly download?: {readonly bytes: number; readonly path: string}
}

export async function previewAudio(
  client: VoiceClient,
  assetId: string,
  options: {
    readonly force?: boolean
    readonly output?: string | undefined
  } = {},
): Promise<VoiceResult<PreviewResult>> {
  const id = validateVoiceId(assetId, 'asset')
  const output =
    options.output === undefined ? undefined : resolve(options.output)
  if (output !== undefined && options.force !== true) {
    await rejectExistingOutput(output)
  }
  const response = await client.previewAudio(id)
  if (output === undefined) {
    return result({preview: response.data}, response.metadata)
  }
  const bytes = await client.downloadPreview(response.data, MAX_PREVIEW_BYTES)
  try {
    await writeFile(output, bytes, {flag: options.force === true ? 'w' : 'wx'})
  } catch (error) {
    if (nodeErrorCode(error) === 'EEXIST') throw outputConflict(output)
    throw error
  }
  return result(
    {download: {bytes: bytes.byteLength, path: output}, preview: response.data},
    response.metadata,
  )
}

export async function addCredential(
  client: VoiceClient,
  input: {
    readonly apiKey: string
    readonly label: string
    readonly projectId?: string | undefined
    readonly provider: string
  },
): Promise<VoiceResult<VoiceProviderCredential>> {
  const response = await client.createCredential({
    apiKey: input.apiKey,
    label: validateLabel(input.label),
    provider: input.provider,
    ...(input.projectId === undefined ? {} : {projectId: input.projectId}),
  })
  return result(response.data, response.metadata)
}

export async function listCredentials(
  client: VoiceClient,
  projectId?: string,
): Promise<VoiceResult<readonly VoiceProviderCredential[]>> {
  const response = await client.listCredentials(projectId)
  return result(response.data, response.metadata)
}

export async function viewCredential(
  client: VoiceClient,
  credentialId: string,
): Promise<VoiceResult<VoiceProviderCredential>> {
  const response = await client.retrieveCredential(
    validateVoiceId(credentialId, 'credential'),
  )
  return result(response.data, response.metadata)
}

export async function verifyCredential(
  client: VoiceClient,
  credentialId: string,
): Promise<VoiceResult<VoiceProviderCredential>> {
  const response = await client.verifyCredential(
    validateVoiceId(credentialId, 'credential'),
  )
  return result(response.data, response.metadata)
}

export async function deleteCredential(
  client: VoiceClient,
  credentialId: string,
): Promise<VoiceResult<VoiceResourceDeleted>> {
  const response = await client.deleteCredential(credentialId)
  return result(response.data, response.metadata)
}

function validateLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new PolymorfaConfigurationError(
      `--label must be 1 to ${MAX_NAME_LENGTH} characters.`,
      'label',
    )
  }
  return trimmed
}

// ── Rendering ──────────────────────────────────────────────────────────────

export function renderAudioList(
  items: readonly VoiceAudioAsset[],
  page: VoiceListResult<VoiceAudioAsset>['page'],
): string {
  const rows = items.map((asset) =>
    [
      asset.id,
      asset.name,
      asset.source,
      asset.status,
      duration(asset.durationMs),
      asset.createdAt,
    ].join('\t'),
  )
  if (rows.length === 0) rows.push('No audio found.')
  if (page.hasMore && page.nextCursor !== null) {
    rows.push(`More results: --cursor ${page.nextCursor}`)
  }
  return rows.join('\n')
}

export function renderAudio(asset: VoiceAudioAsset): string {
  const lines = [
    `Audio\t${asset.id}`,
    `Name\t${asset.name}`,
    `Project\t${asset.projectId}`,
    `Source\t${asset.source}`,
    `Status\t${asset.status}`,
  ]
  if (asset.failureReason !== null) {
    lines.push(`Failure reason\t${asset.failureReason}`)
  }
  lines.push(
    `Duration\t${duration(asset.durationMs)}`,
    `Original format\t${asset.originalFormat ?? '-'}`,
    `Original size\t${asset.sizeBytes === null ? '-' : `${asset.sizeBytes} bytes`}`,
  )
  if (asset.contentSha256 !== null) {
    lines.push(`Content SHA-256\t${asset.contentSha256}`)
  }
  if (asset.tts !== null) {
    lines.push(
      `TTS provider\t${asset.tts.provider}`,
      `TTS voice\t${asset.tts.voiceId}`,
      `TTS model\t${asset.tts.model}`,
      `TTS characters\t${asset.tts.characters}`,
      `TTS key\t${
        asset.tts.credentialId === null
          ? asset.tts.keySource
          : `${asset.tts.keySource} (${asset.tts.credentialId})`
      }`,
    )
  }
  lines.push(
    `Retention\t${
      asset.retentionDays === null
        ? 'kept until deleted'
        : `${asset.retentionDays} days (expires ${asset.expiresAt ?? '-'})`
    }`,
    `In use\t${asset.inUseCount}`,
    `Revision\t${asset.revision}`,
    `Created\t${asset.createdAt}`,
    `Updated\t${asset.updatedAt}`,
  )
  if (asset.readyAt !== null) lines.push(`Ready\t${asset.readyAt}`)
  return lines.join('\n')
}

export function renderAudioSubmitted(asset: VoiceAudioAsset): string {
  if (asset.status === 'ready' || asset.status === 'failed') {
    return renderAudio(asset)
  }
  return `${renderAudio(asset)}\nProcessing continues; run polymorfa voice audio view ${asset.id} or pass --wait.`
}

export function renderPreview(preview: PreviewResult): string {
  if (preview.download !== undefined) {
    return `Saved ${preview.download.bytes} bytes of ${preview.preview.contentType} to ${preview.download.path}.`
  }
  return [
    preview.preview.url,
    `Expires ${preview.preview.expiresAt} (${preview.preview.contentType}). Treat the link as a secret.`,
  ].join('\n')
}

export function renderCredentials(
  credentials: readonly VoiceProviderCredential[],
): string {
  if (credentials.length === 0) return 'No provider credentials found.'
  return credentials
    .map((credential) =>
      [
        credential.id,
        credential.provider,
        credential.label,
        credential.projectId ?? 'team-wide',
        credential.status,
        credential.keyFingerprint,
      ].join('\t'),
    )
    .join('\n')
}

export function renderCredential(credential: VoiceProviderCredential): string {
  return [
    `Credential\t${credential.id}`,
    `Provider\t${credential.provider}`,
    `Label\t${credential.label}`,
    `Project\t${credential.projectId ?? 'team-wide'}`,
    `Key fingerprint\t${credential.keyFingerprint}`,
    `Status\t${credential.status}`,
    `Last error\t${credential.lastError ?? '-'}`,
    `Verified\t${credential.verifiedAt ?? '-'}`,
    `Revision\t${credential.revision}`,
    `Updated\t${credential.updatedAt}`,
  ].join('\n')
}

export function renderDeleted(
  kind: 'audio' | 'provider credential',
  deleted: VoiceResourceDeleted,
): string {
  return `Deleted ${kind} ${deleted.id}.`
}

// ── Helpers ────────────────────────────────────────────────────────────────

function duration(durationMs: number | null): string {
  if (durationMs === null) return '-'
  return `${(durationMs / 1000).toFixed(1)}s`
}

async function rejectExistingOutput(output: string): Promise<void> {
  try {
    await stat(output)
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return
    throw error
  }
  throw outputConflict(output)
}

function outputConflict(output: string): PolymorfaConflictError {
  return new PolymorfaConflictError(
    `Output file ${output} already exists. Pass --force to overwrite it.`,
  )
}

function nodeErrorCode(error: unknown): string | undefined {
  return (error as {code?: string} | undefined)?.code
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function metadataOf(
  metadata: ResponseMetadata,
): VoiceResult<never>['metadata'] {
  return {
    attempts: metadata.attempts,
    status: metadata.status,
    ...(metadata.apiVersion === undefined
      ? {}
      : {apiVersion: metadata.apiVersion}),
    ...(metadata.requestId === undefined
      ? {}
      : {requestId: metadata.requestId}),
  }
}

function result<T>(data: T, metadata: ResponseMetadata): VoiceResult<T> {
  return {data, metadata: metadataOf(metadata)}
}

function listResult<T>(
  page: {
    readonly hasMore: boolean
    readonly items: readonly T[]
    readonly nextCursor: string | null
  },
  metadata: ResponseMetadata,
): VoiceListResult<T> {
  return {
    data: page.items,
    metadata: metadataOf(metadata),
    page: {hasMore: page.hasMore, nextCursor: page.nextCursor},
  }
}
