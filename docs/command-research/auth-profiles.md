# Authentication and profile command research

- **Status:** Implementation research for the first persistent-profile slice
- **Reviewed:** 2026-08-19
- **Commands:** `auth login`, `auth logout`, `auth status`, `auth list`, `auth use`

## Sources reviewed

- [GitHub CLI macOS keyring design](https://github.com/cli/cli/blob/trunk/docs/macos-keyring.md)
- [GitHub CLI secure-storage discussion](https://github.com/cli/cli/discussions/7435)
- [GitHub CLI keyring lookup failure](https://github.com/cli/cli/issues/13317)
- [GitHub CLI plaintext fallback discussion](https://github.com/cli/cli/issues/8954)
- [Vercel CLI entrypoint and authentication resolution](https://github.com/vercel/vercel/blob/main/packages/cli/src/index.ts)
- [Vercel keyring storage release record](https://github.com/vercel/vercel/blob/main/packages/oidc/CHANGELOG.md)
- [Stripe CLI login and project profiles](https://github.com/stripe/stripe-cli/wiki/login-command)
- [Wrangler keyring request and implementation history](https://github.com/cloudflare/workers-sdk/issues/14099)

These projects agree on named or scoped contexts, environment credentials for
automation, and a browser-oriented human login. Their storage behavior is less
consistent. GitHub CLI uses native keyrings but has historically fallen back to
plaintext and has swallowed keyring lookup errors. Vercel supports `keyring`,
`file`, and `auto` modes. Stripe and older Wrangler releases persisted tokens in
configuration files.

## Polymorfa decisions

1. Store profile metadata in a versioned JSON document and store only a stable
   credential reference there.
2. Store API keys in macOS Keychain, Windows Credential Manager, or Linux
   Secret Service through `@napi-rs/keyring`.
3. Fail closed when secure storage is missing, locked, times out, or returns an
   unexpected error. Never silently send an unauthenticated request and never
   fall back to plaintext.
4. Resolve `POLYMORFA_API_KEY` before a stored profile so CI and ephemeral
   automation do not need desktop keychain access.
5. Read a manually supplied API key from standard input. Do not accept it as a
   positional argument or a string flag that would enter shell history.
6. Validate the `pmfa_` credential shape with the public SDK before storage.
   Remote identity verification is reported separately by `auth status`; local
   format validation is not described as server validation.
7. Reserve browser/device login until the backend provides a revocable,
   CLI-specific authorization flow. `auth login` explains that prerequisite
   unless `--with-api-key` is selected.
8. Identify keyring entries by both service and profile-specific account so
   multiple profiles cannot resolve an arbitrary credential.

## Configuration contract

The global configuration directory is overridden by `POLYMORFA_CONFIG_DIR`.
Otherwise it follows the operating-system convention:

- macOS: `~/Library/Application Support/polymorfa`
- Windows: `%APPDATA%\\polymorfa`
- Linux and other Unix: `$XDG_CONFIG_HOME/polymorfa`, or
  `~/.config/polymorfa`

`config.json` uses schema version 1 and contains the active profile plus profile
metadata. Writes are atomic, the directory is created with mode `0700`, and the
file is created with mode `0600`. Those modes are defense in depth; the file
contains no bearer credentials.

## Initial command contract

- `auth login --with-api-key [--profile <name>]` reads one API key from stdin,
  validates its shape, stores it securely, and activates the profile.
- `auth list` shows profile name, active state, credential kind, and defaults;
  it never opens the keyring.
- `auth use <profile>` changes only the active local profile.
- `auth status [--profile <name>]` distinguishes environment credentials,
  stored metadata, secure credential availability, and remote validation.
- `auth logout [--profile <name>]` removes the exact secure credential and its
  metadata. It does not affect environment variables.

All commands support human and JSON output. Non-interactive failure messages
name the exact recovery command or environment variable.
