# Project-template submission command gate

`template submit` consumes `MessagingClient.templates.submit` from SDK PR #308
plus its one-attempt follow-up. The API contract is
`POST /messaging/projects/{projectSlug}/templates/{id}/submit` at
`polymorfa/polymorfa` PR #377, commit
`0f559ed7f89227fa220d6a0275fcc40b8e319a55`. That route returns local
validation feedback before dispatching an invalid draft. The CLI makes one
attempt even with its older SDK pin, and requires `--yes` for the provider
effect. A lost response is not a rejection; inspect the Number's Meta catalog
before another attempt.

This command is implementation-only until the upstream API branches merge,
the SDK follow-up merges and publishes under an exact registry version, and
the CLI pins that version with a regenerated lockfile. No live Meta submission,
approval webhook, deployed path, or customer availability was established by
this change. Cloud onboarding beta authority and release controls remain
unchanged.
