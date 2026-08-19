# Business App command research

- **Status:** Complete 25-operation Messaging Business App implementation slice
- **Reviewed:** 2026-08-20
- **SDK baseline:** `3324a1d5ae840ed96d1a5f987880587cab2312fb`

## Sources reviewed

- [GitHub CLI `gh api`](https://cli.github.com/manual/gh_api), including its
  `--input <file>` and `--input -` conventions for complete structured bodies.
- [Stripe CLI resource commands](https://github.com/stripe/stripe-cli/wiki/resource-commands),
  including resource-first nouns with explicit retrieve/create/update actions.
- [Shopify CLI store execution](https://github.com/Shopify/cli/blob/main/packages/cli/README.md),
  including explicit JSON variable files and opt-in mutation semantics.
- The pinned Polymorfa Business App contract, live runner behavior, and public
  TypeScript SDK.

The CLI combines resource-oriented discoverability with complete JSON input for
bodies whose nested media, hours, compliance, or move structures would become
an error-prone wall of flags. Common bounded actions remain named flags.

## Shipped command tree

```text
business
  profile
    view
    update --input <file|->
    cover
      set --url <url> | --file <path>
      delete <cover-photo> --yes
  catalog
    view --jid <jid> [--after ... --limit ... --width ... --height ...]
    create
    cart
      set --enabled <true|false>
  product
    view <product> --jid <jid>
    create --input <file|->
    replace <product> --input <file|->
    delete <product> --yes
    visibility
      set <product> --hidden <true|false>
    appeal <product> --reason <text>
  collection
    list --jid <jid> [--after ... --collection-limit ... --item-limit ...]
    view <collection> --jid <jid> [--after ... --limit ...]
    create --name <name> --product <id>...
    update <collection> [--name ... --add-product ... --remove-product ...]
    delete <collection> --yes
    reorder --input <file|->
    appeal <collection> --reason <text>
  order
    view <order> --token <event-token>
  compliance
    view
    replace --input <file|->
  accounts
    view
  eligibility
    view
```

These 25 operations require an organization/server API key and an active Linked
Device session. They do not support project credentials, browser client tokens,
or Cloud API sessions. Reads retain the exact `profile:read` or `business:read`
scope boundaries; mutations retain `profile:write`. The CLI fails client tokens
before transport instead of attempting raw-request bypasses.

## Input and safety decisions

`--input` reads one JSON value from a file or bounded standard input. Profile
hours, product media/compliance, collection moves, and complete merchant
compliance retain their public SDK shapes. This keeps scripts reviewable and
avoids lossy parsing of nested structures. JSON output always retains the full
data and SDK response metadata.

The CLI adds local checks where the live runner is stricter or more dangerous
than the generated schema:

- a product replacement must explicitly include `hidden`; omission is rejected
  because the runner otherwise replaces it with `false`;
- product images provide exactly one of `url`, `base64`, `mediaUrl`, or the
  CLI-only `file` convenience source, with at most ten images and ten video
  URLs; local files are preflighted at 16 MiB and converted to SDK base64;
- price and sale-price values are decimal strings of at most 18 digits in
  thousandths, and price requires a three-letter uppercase currency;
- collection product IDs and reorder moves are bounded and unique, while an
  update cannot add and remove the same product;
- appeals are nonempty and at most 4,096 UTF-8 bytes; and
- local cover photos are checked before and after reading against the 5 MiB
  decoded limit.

Cover and product media remain JSON sources. The CLI does not label them
multipart, streaming, resumable, or upload resources. Delete commands require
`--yes`; reversible visibility/cart changes and appeals do not. Every mutation
accepts an idempotency key. Responses preserve either the synchronous data or
the live asynchronous request ID rather than assuming one envelope.

## Cursor and source gaps

Catalog reads accept an opaque `after` cursor and may return next/previous.
Collection list may return next. Collection view accepts `after` but exposes no
next cursor, so the CLI cannot safely continue automatically. Bounds remain
1..100 products, 1..20 collections, and 1..1024 requested image dimensions.

The source exposes no independent catalog list, order list/history, product or
collection search/history, Business App watch/listen stream, binary/multipart
upload, or resumability. Quick Replies remain their own top-level resource. The
CLI does not invent any of these operations.

At this exact baseline the SDK ledger records 331 total / 184 covered / 84
missing / 63 excluded / 0 partial / 0 changed operations.
