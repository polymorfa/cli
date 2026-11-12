# Credential cutover acceptance

API source: polymorfa/polymorfa #647 at f4a82c014e8ea8deb476fce4d81bf27591981c63.
SDK source: polymorfa/sdks #355. CLI credential validation continues to use the
public SDK; it adds no parser or exact-length validator. Tests use the public
20-byte CRC32 opaque-key fixture and check that invalid checksums fail before
secure-storage writes.

The committed SDK dependency predates this contract. Before merging/releasing,
pin the exact accepted SDK registry version and update package-lock.json. A local
candidate tarball can prove behavior but cannot substitute for registry integrity,
matching environment acceptance or the release receipt required by RELEASING.md.
No guessed package version or permissive compatibility fallback is allowed.

Test keys are ordinary project tokens. The CLI never reveals or creates a Test
key and never attempts to infer test-only authority from credential contents.

The copied `test/fixtures/machine-credentials-v1.json` is byte-for-byte identical
to that API source, SHA-256
`7694d8eb61dca6aed69f41392d2e5fae585084e330b276ee6a71844ef9e2365d`.
The CLI accepts the public opaque key vectors through the published SDK, without
adding a second parser. Current registry dependency
`0.1.0-dev.20261004024706` rejects these vectors as legacy-format credentials.
The SDKs thread owns #355. Its accepted registry artifact is the external gate;
this branch keeps the published dependency and does not publish packages.
