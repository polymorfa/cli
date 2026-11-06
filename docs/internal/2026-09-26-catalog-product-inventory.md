# Catalog product inventory command gate

`cloud catalog products` consumes the typed
`MessagingClient.cloudCatalogs.listProducts` method from the SDK follow-up to
PR #313. The exact API source is `polymorfa/polymorfa` PR #380 at
`bbfb2f4af3a8e1289074d9b7d0ed058b96881410`; its Graph OpenAPI copy is
`docs/api-reference/openapi.graph.json` with SHA-256
`b9d3778f17a90fd0c58e0cb1b3f6ef689661980fa83ad7565bc55ae4ab93fab4`.
The API checks live WABA/project authority and a linked catalog before reading
Meta's `/{catalogId}/products` edge. The response carries only the projected
fields and opaque cursors, never Meta paging URLs.

The CLI remains on its older exact SDK registry version. Merge the upstream
API and SDK PR chains, publish and verify the SDK artifact, then pin that exact
version and regenerate the CLI lockfile before CLI merge or release. No live
catalog permissions, product visibility, deployed path or customer access were
verified here. No release flag or Admin capability changes.
