# Raw Marketing Messages status command gate

`cloud marketing status` consumes `MessagingClient.cloudMarketing.status` from
`polymorfa/sdks` PR #315, stacked on SDK PR #314. Its API source is
`polymorfa/polymorfa` PR #383 at
`1e1d613de599c2b4334f8de81fab087c74f31424`; the Graph OpenAPI copy has
SHA-256 `1270c8fb32a09cb717f3ea8edd6bd657e8ff3110e03a6286e68d5e16affff474`.
The CLI renders the exact raw status object and does not interpret terms,
eligibility, insight access or a send decision.

The CLI retains its older exact SDK registry pin in `package.json` and
`package-lock.json`. This source change cannot be published or released until
the API and SDK PR stacks merge, the SDK is published and its exact version and
integrity verified, and that version is pinned here with a regenerated
lockfile. No registry or production setting was changed.

API: separate PR #383; SDKs: typed TypeScript consumer in a separate stacked
PR; CLI: new read-only command and help; Docs: CLI README plus API/SDK public
documentation in their respective PRs; Feature release: existing Graph beta
gate remains off by default, no enrollment or entitlement change; Admin:
unaffected. No tests, typechecks, builds, documentation checks or live Meta
requests were run at the user's request.
