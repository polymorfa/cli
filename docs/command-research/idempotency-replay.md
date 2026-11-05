# Idempotency replay integration

This guidance binds to backend source
`43a286d2133c2328eb30d6210572d9bfc19734f0` in
[API #890](https://github.com/polymorfa/polymorfa/pull/890) and the exact
consumer work in [SDK #369](https://github.com/polymorfa/sdks/pull/369).
It adds no automatic retry, key rearm or new provider/financial action.

All eight remaining Messaging and campaign help descriptions now use the
one-hour receipt window. A recorded error does not prove the write had no
effect; callers keep the same key and reconcile events or the resource.
Sensitive response retention remains held. The first response is unchanged,
and replay-unavailable leaves the durable execution fence intact.

The actual CLI reference producer completed after integrating current main and
building the current commands. Its inventory contains 381 commands. Before the dependency-security fix was
committed, the full local verification passed: formatting, lint, typechecking,
118 test files with 1,164 tests, build, reference and browser checks, package
dry run and a production audit with zero vulnerabilities. This source-binding
update changes only this internal record; it changes no command or package
behavior. Hosted CI and exhaustive code/security reviews remain required.

API source compatibility, SDK source and error recognition, CLI help/reference,
canonical EN/PT Docs and marketing are coordinated across the existing family.
Source merge does not establish deployed API or published package availability.
No Admin capability, MCP, SQL, provider, secret, flag or deployment changed.
