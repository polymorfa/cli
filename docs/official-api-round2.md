# Official API round-2 commands

These commands prepare flagged betas. Enrollment, an active connection and the
required scopes remain server requirements. `feature_unavailable` remains an
authorization error with exit code 3 and a structured error on stderr with
`--json`. No command grants access or claims GA availability.

The CLI PR waits for an accepted SDK prerelease containing these methods.
`contracts/official-api-round2.json` records the exact merged backend sources and
a publication hold. The committed SDK dependency remains its existing registry
prerelease until the containing package is available. A local candidate build is
verification evidence only.

```sh
polymorfa cloud catalog list --session NUMBER_ID --json
polymorfa cloud catalog get --session NUMBER_ID --catalog CATALOG_ID --json
polymorfa cloud catalog sync --session NUMBER_ID --catalog CATALOG_ID --json
polymorfa cloud catalog products --session NUMBER_ID --catalog CATALOG_ID --limit 50 --json
polymorfa cloud marketing status --session NUMBER_ID --json
polymorfa contact block CONTACT_ID --session NUMBER_ID --json
polymorfa contact unblock CONTACT_ID --session NUMBER_ID --json
polymorfa cloud group picture GROUP_ID --session OFFICIAL_NUMBER_ID --file picture.jpg --json
polymorfa group picture GROUP_ID --session HYBRID_NUMBER_ID --file picture.jpg --json
polymorfa webhook update WEBHOOK_ID --owner organization --batching on --batch-max-events 100 --batch-window-ms 1000 --json
polymorfa webhook update WEBHOOK_ID --owner organization --batching off --json
```

Replace the uppercase IDs with your resource IDs. Choose your existing regional
Messaging base URL and credentials using the ordinary profile/environment
settings. Native catalog reads use saved snapshots; only sync calls Meta. Sync
runs once and may take 50 seconds; its default timeout is 60 seconds. A new sync
inside 120 seconds returns `catalog_sync_cooldown` with Retry-After. Product
pages accept the returned `nextCursor` via `--cursor`. Existing Graph catalog
commands still use `--waba`, `--graph-version` and `--after`; these cannot be
mixed with a native `--session` target.

Marketing status reports onboarding, terms, raw provider values and next action.
Unknown status never proves eligibility. Terms are accepted in WhatsApp Manager.
The existing Graph form remains `cloud marketing status --waba WABA_ID
--graph-version VERSION`.

Native block/unblock uses public contact IDs, including identities the API
resolves to an ordinary BSUID or phone. Parent BSUIDs are metadata only and
cannot be targets. An uncertain provider effect must be checked before a new
attempt. Reverting a CLI change does not undo an applied block or picture.

`cloud group picture` uploads one multipart JPEG for an Official-only Number:
square, at least 192 x 192 pixels, at most 5 MB. The backend validates the image.
Hybrid Numbers use `group picture` on the Linked Devices connection only.
`hybrid_group_linked_devices_unavailable` means not executed. Never route the
same operation through Official as recovery. Group history remains available
through existing `chat` commands with opt-in regional history access.

Batching applies to Platform organization/project webhook endpoints in native
format. It defaults off. Configure the receiver to verify and handle both
single events and the version 1 `event_batch` envelope before enabling it.
Deduplicate member event IDs and batch IDs; acknowledge the whole request only.
The event limit is 2-100, but a window can emit one event. The window is
100-1000 ms. Omitted settings preserve the endpoint's saved values on update.
The server checks saved format and enrollment. Disabling remains available after
withdrawal. `webhook view` shows saved batching settings.

Private Console routes are excluded. No live Meta, hosted webhook receiver,
regional deployment, package publication or customer acceptance is established
by these command examples. Matching staging acceptance gates prereleases;
production acceptance separately gates stable publication.
