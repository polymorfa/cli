import {AccountDeviceAuthService} from './service.js'
import {
  AccountDeviceProfileRepository,
  SecureAccountDeviceCredentials,
} from './storage.js'

export function createAccountDeviceAuthService(): AccountDeviceAuthService {
  return new AccountDeviceAuthService(
    new AccountDeviceProfileRepository(),
    new SecureAccountDeviceCredentials(),
  )
}
