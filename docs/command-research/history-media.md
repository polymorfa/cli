# Hosted history media source boundary

This command follows API PR #333 at
`5044826d122759aaa8be3e2c2d0f120a326fda81`,
`apps/api/docs/openapi.json` SHA-256
`b7b79f399ce9f6944497a2970e184fe40c276dff9034726297ca18b2aab0bd41`.
The source operation is `getChatMessageMedia` at
`GET /messaging/{session}/chats/{conversation}/messages/{messageId}/media`.
API PR #385 adds a final history authority recheck without changing that
contract. SDK PR #316 at `69e680ee37fbb86f50a86294cb17f63c78cd729c`
adds `MessagingClient.chats.downloadMessageMediaStream`.

The CLI package still pins an older published SDK. Do not update its exact
registry dependency until PR #316 is merged and the resulting SDK artifact is
published and its version and integrity are verified. The source command can
then use that exact artifact. API merge, beta enrollment, regional deployment,
and real provider-backed acceptance remain separate gates. The command does
not establish any of them.
