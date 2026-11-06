# Number-scoped test routes

Source contract: `contracts/test-number-dropin-routes.json`, API PR
https://github.com/polymorfa/polymorfa/pull/792. The API base is #647.

`trigger` sends the Number ID in the path, never body `session`. The optional
`--from-number` is another Test Number ID, serialized as `fromNumber`;
`--from-session` has no alias. Trigger/list require no project flag. History
fixture creation keeps its project flag because it precedes Number creation.

These commands use the installed SDK's public `raw.request` transport and keep
its auth, timeout, retries and errors. The existing package pin stays valid;
there is no unpublished SDK dependency. No credential handling changes.

API: consumed and pinned; no API implementation here. SDK: transport reused,
typed methods updated separately. CLI: commands/help/examples/tests updated.
Docs: README and internal launch sample updated; public docs app handoff stays
with #783. Feature releases: no flag or availability change. Admin: no new
state/action and no direct dependency. Historical September notes remain
evidence of their original snapshot; their old names do not describe aliases.

Scope names remain `sandbox:read` / `sandbox:write`. Renaming affects CLI README
and internal launch/reference notes, SDK contracts/scope inputs, API scope
parsing and enforcement, Console key pickers and public documentation. No
spelling or numeric scope bit changes are included. No publication or
deployment is performed.
