import {SecureCredentialStore} from './credentials.js'
import {ProfileRepository} from './profiles.js'
import {AuthService} from '../services/auth.js'

export function createAuthService(): AuthService {
  return new AuthService(new ProfileRepository(), new SecureCredentialStore())
}
