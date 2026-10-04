# CLI releases from main

All CLI PRs target `main`. The preserved `dev` branch is no longer a publication
trigger. The daily nightly runs at 02:30 UTC and uses npm's `dev` tag. Stable
releases require an explicit `x.y.z` and the protected `npm-stable` environment.
The workflow remains `publish-dev.yml` to preserve its publisher identity.

The SDK publishes first. A CLI build selects an exact SDK version from the
matching package channel, downloads its registry artifact and verifies its
integrity. Its embedded contract receipt must prove matching staging acceptance
for a nightly or production acceptance for stable. Missing SDK provenance,
failed scenarios, different source/spec/environment or an unavailable SDK block
publication. Nightly timestamps never advance `Polymorfa-Version`.

The build pins that exact SDK version in its disposable manifest and lockfile,
runs verification, then writes the package version. The packed CLI is installed
into a clean consumer and its `version --json` output must match both versions.
The tarball includes `dist/release-contract.json` binding CLI, SDK and API
revisions. A repeated version must have matching registry integrity. An
unchanged CLI source plus the same exact SDK skips the next nightly.

Publication emits feature-to-ticket stage receipts for a later Linear bot. A
successful nightly does not mean production availability or authorize closing
feature tickets. Feature definitions remain in Notion; engineering issues stay
in Linear. The monorepo feature registry owns their links.

Keep the existing `npm-prerelease` credentials/trusted publishing and configure
`npm-stable` for approved main releases. The private CLI repository retains
`provenance: false` for npm's public source attestation; the embedded acceptance
receipt still supplies contract evidence. Use the existing token fallback when
trusted publishing is unavailable. Do not expose source credentials in packages.

Run `npm ci`, `npm run verify`, `node --test scripts/release-evidence.test.mjs`
and Actionlint before merge. These checks prove local packaging behavior; hosted
acceptance and npm publication remain separate gates. Roll back an affected
channel to a previously verified CLI and SDK pair through an authorized release
operation. Never replace a published version.
