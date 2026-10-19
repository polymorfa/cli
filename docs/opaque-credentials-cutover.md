# Credential cutover acceptance

API source: polymorfa/polymorfa #647 at 2ec6d0f036f3ea80addf1813dfea74e82ca143fc.
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
