# Prepared CLI trigger documentation

`launch-docs/cli-trigger.mdx` is an internal insertion snippet for `docs/sandbox/test-events.mdx`, after its TypeScript SDK example and before the fixture list. The CLI is unpublished, so do not add the snippet or a CLI changelog entry to public Mintlify until a released CLI artifact includes this command, its installed behavior is checked, and the Test numbers beta audience can use the deployed API path.

The snippet follows the CLI implementation and README at `polymorfa/cli` PR #15, SDK version `0.1.0-dev.20260923093259` from SDK merge commit `2b693964305b91dc34b9092ca5774055c7e47d88`, and the existing Test events guide. A clean CLI install resolved the exact SDK registry artifact. `npm run verify` passed on the branch merged with CLI `dev`: 635 tests in 73 files, build, typecheck, formatting, lint, pack check, and production audit. Compiled `trigger --help` confirms the snippet's flags and fixture name. The command tests exercise local HTTP requests, including typed `restrictionActive=false`, refusal paths, and no-request validation. No deployed API, webhook, event history, live listener, or released CLI install was exercised.

At publication, verify the released CLI version and installed `trigger --help`, then insert the snippet into the existing guide. Render the page at mobile and desktop widths, run Mintlify broken-link and validation checks, and date a customer changelog entry for the available release. Confirm the `release-test-numbers` gate, team enrollment, Test number, and deployed API route for the intended audience. No flag or entitlement change is part of PR #15.

Proposed changelog copy, with date set when customers can use the CLI:

> The Polymorfa CLI can list Test event fixtures and trigger signed events for a Test number. It also sends a simulated message from another Test number with `--from-session`. See [Trigger test events](/sandbox/test-events).

API: unchanged by this CLI work; the existing testing route and scopes remain authoritative. SDK: fixture and override types updated in SDK PR #290, then published under the exact version above. CLI: command, README, and tests updated in PR #15. Docs: CLI README and this internal snippet updated; public insertion remains a release gate. Feature releases: existing Test numbers beta access and enrollment remain; live availability is unverified here. Admin: unchanged because this command adds no staff control.
