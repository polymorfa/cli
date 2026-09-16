# QuickLink command contract

- **Status:** Implemented against the typed hosted QuickLink SDK resource;
  deployed Staging acceptance remains a separate gate
- **Reviewed:** 2026-09-08
- **Backend baseline:** `6918c56135e28ba64557e344cb72889f1f517eb5`

## Why this command family exists

QuickLink is the standard Polymorfa number-pairing workflow. The CLI creates a
short-lived hosted URL, inspects its status, or cancels it. It does not fetch
direct session QR payloads or pairing codes. This keeps the phone-holder flow
on the hosted page and preserves entitlement boundaries around direct pairing.

## Command tree

| Command            | Typed SDK operation                   | Effect                                                   |
| ------------------ | ------------------------------------- | -------------------------------------------------------- |
| `quicklink create` | `MessagingClient.quickLinks.create`   | Create a short-lived hosted pairing URL                  |
| `quicklink view`   | `MessagingClient.quickLinks.retrieve` | Read one link's status                                   |
| `quicklink cancel` | `MessagingClient.quickLinks.cancel`   | Invalidate a pending link and remove its pending session |

All commands require explicit project context from `--project` or a
project-bound profile. They accept an organization API key or exact-project
token with `quicklink:manage`; browser client tokens fail before transport.

Creation exposes the complete typed input: offered methods, Customer, business
name, history-sync policy, allowed callback URL, theme, accent, pre-filled
phone, and a 300–3600 second lifetime. The CLI rejects duplicate methods,
blank business names, malformed accents, malformed phone values, and callback
userinfo before transport. The server remains authoritative for project,
Customer, callback-allowlist, and entitlement checks.

The returned URL is short-lived credential material. Human and explicit JSON
output return it because it is the purpose of creation; verbose diagnostics,
profiles, and error output never copy it. An idempotency key may be supplied for
create and cancel. Cancellation requires TTY confirmation or `--yes` before a
client is constructed.

The API exposes no list, recover, history, QR-rendering, direct-code, or status
stream operation. Future extensions must recheck the maintained API and typed
SDK rather than fill those gaps with `raw.request`.
