# CLI npm development releases

The source repository is private. The public npm package is `@polymorfa/cli`;
the supported prerelease install selector is `@dev`. Publishing a package is a
separate decision from merging code. The release owner chooses the version and
authorizes each npm publication after inspecting the exact commit, package
contents, SDK pin, and customer availability.

## First-package bootstrap

The package is not yet in npm. npm trusted publishing is configured on an
existing package, so the npm organization owner must create the first package
with an owner credential and any required two-factor challenge. The workflow in
this repository deliberately refuses to publish while the package is absent.

**The first publication may also create npm's `latest` dist-tag even when the
command specifies `--tag dev`.** The owner must decide whether that exposure is
acceptable before the bootstrap. Do not assume the `dev` tag isolates the first
version. Do not create the first version or move `latest` as part of preparing a
pull request.

For an approved bootstrap, use a reviewed `dev` commit with a unique package
version and exact published SDK dependency. Run `npm ci`, `npm run verify`, pack
the repository with `npm pack --ignore-scripts`, inspect the tarball, and test
installation from that tarball in a clean directory on supported Node versions.
The owner then publishes that exact tarball publicly with the `dev` tag and
provenance disabled. Use an interactive owner session or a short-lived credential;
do not place an npm write token in source or GitHub Actions. Verify the registry
version, integrity, `dev` and `latest` tags, and a fresh `@dev` install after the
publish. Record any `latest` exposure in the release decision.

## Subsequent development releases

After bootstrap, the npm organization owner configures a trusted publisher for
`@polymorfa/cli` on npm:

- GitHub organization `polymorfa`, repository `cli`;
- workflow filename `publish-dev.yml`;
- GitHub environment `npm-prerelease`;
- direct `npm publish` allowed.

Create the `npm-prerelease` environment in GitHub with a required reviewer and
restrict it to `dev`. The workflow uses GitHub-hosted Ubuntu runners, an exact
`dev` head commit and the package version supplied at dispatch. The packaging
job has no OIDC permission. It verifies the SDK registry integrity, runs the
project checks, packs once, and smoke tests the tarball. The publish job receives
only that artifact, checks its SHA-256 digest, and requests a short-lived npm
credential through OIDC. It refuses an existing version and publishes with
`--tag dev`. The package's `publishConfig` also defaults to `dev` so a local
publish does not silently choose the default tag.

Because this GitHub repository is private, npm cannot issue a public provenance
attestation for its packages. Trusted publishing still removes the need for a
persistent npm write token in the workflow. Keep provenance disabled while the
source repository is private; reassess it if repository visibility changes.

Before dispatch, merge a version and lockfile update to `dev`, confirm its
exact-head CI, verify the SDK artifact and its dependency integrity, then review
the release's API, SDK, CLI, public docs, and feature availability. Dispatch
`Publish CLI dev prerelease` on `dev` with the full 40-character `dev` commit
SHA and the matching package version. The workflow fails if `dev` advances
before it checks the source. After approval and publish, inspect the live npm
version and tags, install `@polymorfa/cli@dev` in a clean environment, and run
`polymorfa version --json`. Customer-facing docs and changelog must reflect the
version customers can actually install. Production availability and stable
`latest` remain separate decisions.

Do not rerun a failed or ambiguous publish with a new version until the registry
is checked. npm versions cannot be reused after publication.
