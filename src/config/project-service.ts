import {SecureCredentialStore} from './credentials.js'
import {ProfileRepository} from './profiles.js'
import {ProjectContextService} from '../services/projects.js'

export function createProjectContextService(): ProjectContextService {
  return new ProjectContextService(
    new ProfileRepository(),
    new SecureCredentialStore(),
  )
}
