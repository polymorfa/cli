import {
  AccountDeviceApi,
  AccountDeviceError,
  type AccountDeviceConfiguration,
  type AccountDeviceJwt,
  type AccountDevicePage,
} from './transport.js'
import {
  AccountDeviceStorageError,
  accountDeviceCredentialAccount,
  type AccountDeviceCredentials,
  type AccountDeviceProfile,
  type AccountDeviceProfiles,
  type AccountDeviceProfilesLike,
} from './storage.js'

export interface AccountDeviceLogin {
  readonly profile: string
  readonly userCode: string
  readonly verificationUri: string
}
interface Pending {
  readonly api: AccountDeviceApi
  readonly code: string
  readonly config: AccountDeviceProfiles
  readonly epoch: symbol
  readonly deadline: number
  nextPoll: number
  interval: number
  busy: boolean
}
interface Binding {
  readonly name: string
  readonly config: AccountDeviceProfiles
  readonly profile: AccountDeviceProfile
  readonly api: AccountDeviceApi
}

export class AccountDeviceLoginError extends Error {
  constructor(
    readonly recovery: {
      readonly profileSaved: false | 'unknown'
      readonly credentialPreserved: boolean
      readonly remoteRevocation: 'confirmed' | 'unknown' | 'not_exercised'
    },
  ) {
    super(
      recovery.profileSaved === 'unknown'
        ? 'The account profile update could not be confirmed. Its credential was preserved.'
        : recovery.remoteRevocation === 'confirmed'
          ? 'Sign-in was not saved. The new account session was revoked.'
          : 'Sign-in was not saved. Revocation of the new account session could not be confirmed.',
    )
    this.name = 'AccountDeviceLoginError'
  }
}

// Machine profiles, SDK credential factories, arbitrary raw routes and account
// grant mutation are deliberately absent. Every resource read still reaches
// the API's live user/session/client/grant checks; a verified JWT is no grant.
export class AccountDeviceAuthService {
  readonly #pending = new WeakMap<AccountDeviceLogin, Pending>()
  readonly #epochs = new Map<string, symbol>()
  readonly #cached = new Map<
    string,
    {revision: string | null; jwt: AccountDeviceJwt}
  >()
  readonly #refreshing = new Map<string, Promise<AccountDeviceJwt>>()

  constructor(
    private readonly profiles: AccountDeviceProfilesLike,
    private readonly credentials: AccountDeviceCredentials,
    private readonly api: (
      configuration: AccountDeviceConfiguration,
    ) => AccountDeviceApi = (configuration) =>
      new AccountDeviceApi(configuration),
    private readonly monotonic: () => number = () => performance.now(),
    private readonly now: () => number = Date.now,
  ) {}

  async startLogin(
    profile: string,
    configuration: AccountDeviceConfiguration,
    signal?: AbortSignal,
  ): Promise<AccountDeviceLogin> {
    // Validate before any network or keyring work. Existing profiles require
    // explicit logout; a login cannot silently discard a prior remote session.
    accountDeviceCredentialAccount(profile)
    const config = await this.profiles.load()
    if (Object.hasOwn(config.profiles, profile))
      throw new AccountDeviceError('refused')
    const epoch = this.invalidate(profile),
      api = this.api(configuration),
      started = this.monotonic()
    checkSignal(signal)
    const issued = await api.start(signal)
    checkSignal(signal)
    const login = Object.freeze({
      profile,
      userCode: issued.userCode,
      verificationUri: issued.verificationUri,
    })
    this.#pending.set(login, {
      api,
      code: issued.deviceCode,
      config,
      epoch,
      deadline: started + issued.expiresInSeconds * 1000,
      nextPoll: this.monotonic() + issued.intervalSeconds * 1000,
      interval: issued.intervalSeconds * 1000,
      busy: false,
    })
    return login
  }

  pollDelay(login: AccountDeviceLogin): number {
    const pending = this.pending(login)
    return Math.max(0, pending.nextPoll - this.monotonic())
  }

  async pollLogin(login: AccountDeviceLogin, signal?: AbortSignal) {
    const pending = this.pending(login)
    checkSignal(signal)
    if (pending.busy || this.monotonic() < pending.nextPoll)
      throw new AccountDeviceError('refused')
    pending.busy = true
    const started = this.monotonic()
    let token: string | undefined
    try {
      const result = await pending.api.poll(pending.code, signal)
      if (result.kind === 'session') token = result.sessionToken
      this.pending(login)
      checkSignal(signal)
      if (result.kind !== 'session') {
        if (result.kind === 'slowDown') pending.interval += 5000
        pending.nextPoll = started + pending.interval
        return {
          kind: 'pending',
          waitMilliseconds: this.pollDelay(login),
        } as const
      }
      token = result.sessionToken
      const identity = await pending.api.identity(token, signal)
      const jwt = await pending.api.jwt(token, identity, signal)
      this.pending(login)
      checkSignal(signal)
      if (token === identity.userId || token === identity.sessionId)
        throw new AccountDeviceError('invalid_response')
      const account = accountDeviceCredentialAccount(login.profile)
      const profile: AccountDeviceProfile = {
        kind: 'accountDevice',
        ...pending.api.configuration,
        ...identity,
        credentialAccount: account,
      }
      let stored: AccountDeviceProfiles
      let cleanupConfirmed = true
      try {
        await this.credentials.set(account, token)
        stored = await this.profiles.saveIfRevision(
          pending.config.revision,
          {
            version: 1,
            activeProfile: login.profile,
            profiles: {...pending.config.profiles, [login.profile]: profile},
          },
          () => {
            this.pending(login)
            checkSignal(signal)
          },
        )
      } catch {
        let actual: AccountDeviceProfiles
        try {
          actual = await this.profiles.load()
        } catch {
          // Save may have renamed successfully before cleanup failed. Retain
          // the only credential; absence of a return is never rollback proof.
          throw new AccountDeviceLoginError({
            profileSaved: 'unknown',
            credentialPreserved: true,
            remoteRevocation: 'not_exercised',
          })
        }
        if (actual.profiles[login.profile]?.credentialAccount === account) {
          stored = actual
          cleanupConfirmed = false
        } else {
          let credentialPreserved = false
          try {
            await this.credentials.delete(account)
          } catch {
            credentialPreserved = true
          }
          throw new AccountDeviceLoginError({
            profileSaved: false,
            credentialPreserved,
            remoteRevocation: await revokeFresh(pending.api, token),
          })
        }
      }
      this.#pending.delete(login)
      if (this.#epochs.get(login.profile) === pending.epoch)
        this.#cached.set(login.profile, {revision: stored.revision, jwt})
      return {
        kind: 'signedIn',
        profile: login.profile,
        issuer: profile.issuer,
        userId: profile.userId,
        sessionId: profile.sessionId,
        expiresAtMs: profile.expiresAtMs,
        remoteIdentityValidated: true,
        localCleanupConfirmed: cleanupConfirmed,
      } as const
    } catch (error) {
      this.#pending.delete(login)
      if (error instanceof AccountDeviceLoginError) throw error
      if (token !== undefined)
        throw new AccountDeviceLoginError({
          profileSaved: false,
          credentialPreserved: false,
          remoteRevocation: await revokeFresh(pending.api, token),
        })
      throw error
    } finally {
      pending.busy = false
    }
  }

  cancelLogin(login: AccountDeviceLogin): void {
    this.#pending.delete(login)
    this.invalidate(login.profile)
  }

  async list() {
    const config = await this.profiles.load()
    return Object.entries(config.profiles).map(([name, profile]) => ({
      name,
      active: config.activeProfile === name,
      kind: 'accountDevice' as const,
      issuer: profile.issuer,
      userId: profile.userId,
      sessionId: profile.sessionId,
      expiresAtMs: profile.expiresAtMs,
    }))
  }

  async use(name: string): Promise<void> {
    const binding = await this.binding(name)
    this.invalidate(name)
    await this.profiles.saveIfRevision(binding.config.revision, {
      version: 1,
      activeProfile: name,
      profiles: binding.config.profiles,
    })
  }

  async status(name?: string, signal?: AbortSignal) {
    const binding = await this.binding(name),
      token = await this.credentials.get(binding.profile.credentialAccount)
    if (token === undefined)
      return {
        profile: binding.name,
        kind: 'accountDevice',
        credentialPresent: false,
        remoteIdentityValidated: false,
      } as const
    const live = await binding.api.identity(token, signal)
    assertIdentity(binding.profile, live)
    return {
      profile: binding.name,
      kind: 'accountDevice',
      credentialPresent: true,
      remoteIdentityValidated: true,
      ...live,
    } as const
  }

  async teams(
    name?: string,
    page: AccountDevicePage = {},
    signal?: AbortSignal,
  ) {
    const binding = await this.binding(name),
      jwt = await this.jwt(binding, signal)
    try {
      return await binding.api.teams(jwt, page, signal)
    } catch (error) {
      this.#cached.delete(binding.name)
      throw error
    }
  }
  async projects(
    teamId: string,
    name?: string,
    page: AccountDevicePage = {},
    signal?: AbortSignal,
  ) {
    const binding = await this.binding(name),
      jwt = await this.jwt(binding, signal)
    try {
      return await binding.api.projects(jwt, teamId, page, signal)
    } catch (error) {
      this.#cached.delete(binding.name)
      throw error
    }
  }

  async logout(name?: string, signal?: AbortSignal) {
    if (name !== undefined) this.invalidate(name)
    const binding = await this.binding(name)
    this.invalidate(binding.name)
    const token = await this.credentials.get(binding.profile.credentialAccount)
    let remoteRevocation: 'confirmed' | 'unknown' | 'not_exercised' =
      'not_exercised'
    if (token !== undefined) {
      try {
        try {
          assertIdentity(
            binding.profile,
            await binding.api.identity(token, signal),
          )
        } catch (error) {
          // Only absent/expired credentials may use the idempotent sign-out.
          // A bound identity mismatch must never revoke another device.
          if (!(
            error instanceof AccountDeviceError &&
            error.code === 'login_required'
          ))
            throw error
        }
        await binding.api.signOut(token, signal)
        remoteRevocation = 'confirmed'
      } catch {
        remoteRevocation = 'unknown'
      }
    }
    const current = await this.profiles.load(),
      profile = current.profiles[binding.name]
    if (profile?.credentialAccount !== binding.profile.credentialAccount)
      return {
        profile: binding.name,
        remoteRevocation,
        localMetadataRemoved: false,
        localCredentialRemoved: false,
      } as const
    const profiles = {...current.profiles}
    delete profiles[binding.name]
    let metadataRemoved = false
    try {
      await this.profiles.saveIfRevision(current.revision, {
        version: 1,
        profiles,
        ...(current.activeProfile !== undefined &&
        current.activeProfile !== binding.name
          ? {activeProfile: current.activeProfile}
          : {}),
      })
      metadataRemoved = true
    } catch {
      try {
        metadataRemoved = !Object.hasOwn(
          (await this.profiles.load()).profiles,
          binding.name,
        )
      } catch {
        /* Unknown publication: preserve the credential. */
      }
    }
    let credentialRemoved = token === undefined
    if (metadataRemoved)
      try {
        await this.credentials.delete(binding.profile.credentialAccount)
        credentialRemoved = true
      } catch {
        credentialRemoved = false
      }
    return {
      profile: binding.name,
      remoteRevocation,
      localMetadataRemoved: metadataRemoved,
      localCredentialRemoved: credentialRemoved,
    } as const
  }

  private pending(login: AccountDeviceLogin): Pending {
    const pending = this.#pending.get(login)
    if (
      !pending ||
      this.#epochs.get(login.profile) !== pending.epoch ||
      this.monotonic() >= pending.deadline
    )
      throw new AccountDeviceError('login_required')
    return pending
  }
  private invalidate(name: string): symbol {
    const epoch = Symbol()
    this.#epochs.set(name, epoch)
    this.#cached.delete(name)
    return epoch
  }
  private async binding(name?: string): Promise<Binding> {
    const config = await this.profiles.load(),
      selected = name ?? config.activeProfile
    if (selected === undefined || !Object.hasOwn(config.profiles, selected))
      throw new AccountDeviceError('login_required')
    const profile = config.profiles[selected]!
    return {name: selected, config, profile, api: this.api(profile)}
  }
  private async jwt(
    binding: Binding,
    signal?: AbortSignal,
  ): Promise<AccountDeviceJwt> {
    checkSignal(signal)
    const cached = this.#cached.get(binding.name)
    if (
      cached?.revision === binding.config.revision &&
      cached.jwt.expiresAtMs > this.now()
    )
      return cached.jwt
    const key = `${binding.name}:${binding.config.revision ?? ''}`
    const existing = this.#refreshing.get(key)
    if (existing) return existing
    const epoch =
      this.#epochs.get(binding.name) ?? this.invalidate(binding.name)
    const refresh = (async () => {
      const token = await this.credentials.get(
        binding.profile.credentialAccount,
      )
      if (token === undefined) throw new AccountDeviceError('login_required')
      const jwt = await binding.api.jwt(token, binding.profile, signal)
      checkSignal(signal)
      const current = await this.profiles.load()
      if (
        this.#epochs.get(binding.name) !== epoch ||
        current.revision !== binding.config.revision ||
        current.profiles[binding.name]?.credentialAccount !==
          binding.profile.credentialAccount
      )
        throw new AccountDeviceStorageError('changed')
      this.#cached.set(binding.name, {revision: current.revision, jwt})
      return jwt
    })()
    this.#refreshing.set(key, refresh)
    try {
      return await refresh
    } finally {
      if (this.#refreshing.get(key) === refresh) this.#refreshing.delete(key)
    }
  }
}

function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw new AccountDeviceError('refused')
}
function assertIdentity(
  expected: AccountDeviceProfile,
  actual: {sessionId: string; userId: string},
) {
  if (
    expected.sessionId !== actual.sessionId ||
    expected.userId !== actual.userId
  )
    throw new AccountDeviceStorageError('changed')
}
async function revokeFresh(
  api: AccountDeviceApi,
  token: string,
): Promise<'confirmed' | 'unknown'> {
  // Cleanup is the same pinned issuer's own-session operation, never a grant,
  // retry, profile fallback or extension of the canceled authorization request.
  try {
    await api.signOut(token, AbortSignal.timeout(5000))
    return 'confirmed'
  } catch {
    return 'unknown'
  }
}
