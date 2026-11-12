export const UNSUPPORTED_COMMANDS: Readonly<Record<string, string>> = {
  'account login':
    'requires local account profiles and the operating-system keyring',
  'account list':
    'requires local account profiles and the operating-system keyring',
  'account use':
    'requires local account profiles and the operating-system keyring',
  'account status':
    'requires local account profiles and the operating-system keyring',
  'account logout':
    'requires local account profiles and the operating-system keyring',
  'account teams':
    'requires local account profiles and the operating-system keyring',
  'account projects':
    'requires local account profiles and the operating-system keyring',
  'calls media': 'streams call audio as binary PCM',
  'agent setup': 'configures coding agents on the local computer',
}
