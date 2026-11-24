# Customer command contract

The Customer command family maps the complete public Customers surface in the
Platform contract. Every request uses an organization server API key and an
explicit project ID.

| Command                        | Platform operation                                                   |
| ------------------------------ | -------------------------------------------------------------------- |
| `customer status`              | Check project enablement                                             |
| `customer enable`              | Enable Customers and assign existing Numbers to the default Customer |
| `customer list`                | List and filter Customer summaries with cursor metadata              |
| `customer create`              | Create a Customer with optional name and external ID                 |
| `customer view`                | Retrieve one Customer                                                |
| `customer update`              | Update or clear Customer profile fields                              |
| `customer archive`             | Archive a non-default Customer                                       |
| `customer restore`             | Restore an archived Customer                                         |
| `customer number list`         | List assigned Numbers                                                |
| `customer event list`          | List recent lifecycle events                                         |
| `customer pairing-link create` | Create a one-time pairing URL                                        |
| `customer pairing-link list`   | List pairing-link records                                            |
| `customer pairing-link revoke` | Revoke a pairing link                                                |
| `customer number transfer`     | Transfer a Number from a confirmed source Customer                   |

The CLI preserves `Idempotency-Key` headers for every operation that requires
them. It also keeps list cursor metadata in JSON output. Human output masks
phone numbers returned by Number endpoints; full Customer retrieval returns the
API response unchanged under `--json`.

Customer profiles carry no phone number, and pairing-link creation accepts no
page locale or theme. The pinned contract removed those fields, so the CLI no
longer offers `--phone`, `--clear-phone`, `--locale`, or `--theme`. Pairing
pages take appearance from saved QuickLink settings.
