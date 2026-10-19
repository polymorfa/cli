# CLI shared-image pin follow-up

Collaborator: purpshell. Agent: Codex/gpt-6.1-sol, T3 thread
8ad9e447-6fd5-4fc5-8e96-189326af2c28. Manual visible-message and selected-outcome
summary only; no automatic transcript coverage claim. Excludes raw logs,
credentials, key attachments and hidden reasoning. Registration is inherited
from the coordinated monorepo record (PR 511), not newly requested here.

The owner authorized the CI cutover, pausing new paid CI, and an exact-head
merge after clean review followed by a Region system alert only after dev CI
works. Public repositories remain GitHub-hosted; staging and PR 744 stay held.

Dependency: monorepo PR 781 source 30d4c516b827098614cb64469f66028e7727f6b7.
The shared image pins rustup-init to its versioned 1.29.1 archive without
changing the installer bytes. Every other image input was checked unchanged.
The original image age was retained. Real reboot testing verified that both
worker profiles disable automatic last-state restoration before isolation.

Candidate 4c554d1f7cead7449c80848fd1f2405c996143b888a2a337e4ad42727de04e0d passed fresh-clone tools, browser, network and admission-refusal
checks. The old CLI pin rejected it and the updated pin accepted it. This
follow-up changes one expected tool-definition hash and its fixture, plus the
internal image/controller record. It adds no dual-hash acceptance, runtime,
package dependency, publication or product deployment change.

Seven local admission tests and actionlint pass. GitHub source CI and the first
main push remain required. No automated review was requested.
