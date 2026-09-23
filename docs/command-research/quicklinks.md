# QuickLink command contract

- **Status:** Implemented against the typed hosted QuickLink SDK resource;
  deployed Staging acceptance remains a separate gate
- **Reviewed:** 2026-09-16
- **Backend baseline:** `1600403db9dcf7996dbbb882375b1165859829d3`
- **SDK baseline:** `08452992a32a392de5fc3d0fa3954ba6addd7f32`

## Why this command family exists

QuickLink is the standard Polymorfa number-pairing workflow. The CLI creates a
persistent hosted URL, inspects its status, or cancels it. It does not fetch
direct session QR payloads or pairing codes. This keeps the phone-holder flow
on the hosted page and preserves entitlement boundaries around direct pairing.

## Command tree

| Command            | Typed SDK operation                   | Route                               | Effect                                                                                       |
| ------------------ | ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `quicklink create` | `MessagingClient.quickLinks.create`   | `POST /messaging/quicklinks`        | Create a persistent hosted onboarding URL                                                    |
| `quicklink view`   | `MessagingClient.quickLinks.retrieve` | `GET /messaging/quicklinks/{id}`    | Read one link's status and onboarding progress                                               |
| `quicklink cancel` | `MessagingClient.quickLinks.cancel`   | `DELETE /messaging/quicklinks/{id}` | Invalidate an unconnected link; initial Number/session cleanup can continue after acceptance |

All three routes require `quicklink:manage`. The API accepts organization keys
and exact-project tokens and scopes project tokens to their own project.

`quicklink create` takes one JSON object from `--input` with `projectId`,
`customerId`, `externalId`, and `configuration`, and rejects other top-level
fields before transport. Presentation and callbacks belong in saved settings
(`widget view|update`). It uses an organization API key; project-token support
for creation is not exposed by this command.

`quicklink view` and `quicklink cancel` accept an organization API key or an
exact-project token and require explicit project context. Browser client tokens
fail before transport. Cancellation requires TTY confirmation or `--yes` before
a client is constructed. The route does not read an `Idempotency-Key`, so the
command offers no idempotency flag. The API rejects cancellation of a connected
link and returns 409 while simulated test setup is still starting. An initial
real link returns `202` after durable cancellation admission and link
invalidation; Number and session cleanup can continue afterward. Supplementary
and test links return `200`.

The returned URL is credential material. Human and explicit JSON output return
it because it is the purpose of creation; verbose diagnostics, profiles, and
error output never copy it.

The API exposes no list, recover, history, QR-rendering, direct-code, or status
stream operation. Future extensions must recheck the maintained API and typed
SDK rather than fill those gaps with `raw.request`.
