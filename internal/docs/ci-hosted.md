# Public CLI CI

The owner made polymorfa/cli public on 2026-10-19. CLI and SDK repositories use
standard GitHub-hosted runners. They are excluded from ci-1, whose runner group
has public-repository access disabled.

`.github/workflows/ci-hosted.yml` preserves the CI display name, Verify Node 22
check and all existing source commands: `npm ci`, `npm run verify`, and the three
release-evidence tests. It runs on pull requests, including forks, and main
pushes using `ubuntu-latest`, read-only repository contents, no persisted
checkout credentials, npm caching and a 20-minute deadline. The workflow uses
`pull_request`, not a privileged target event, and declares no secrets.

No ci-1 manifest, image pin, private tool cache or self-hosted runner is required.
New workflow identity allows source qualification without enabling an old
Blacksmith workflow. Existing source checks, production audit, build and package
dry-run are preserved. Actual GitHub qualification and the first main push
remain required before calling this cutover verified.

CLI commands, SDK dependency, API contracts, package and lockfile, public product
docs/changelog, product flags and Admin controls are unaffected: this changes
only CI routing. The publication workflow is unchanged, schedule/manual only,
and retains matching SDK/API acceptance. No package publication or product
deployment is invoked. Staging and regional rename #744 remain held.
