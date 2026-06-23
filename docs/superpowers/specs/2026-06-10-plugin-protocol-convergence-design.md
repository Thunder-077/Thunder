# Plugin Protocol Convergence Design

## Context

Thunder currently defines the desktop plugin bridge in multiple places:

- `packages/plugin-sdk` defines browser-facing methods and message envelopes.
- `apps/web` defines another request type, protocol version, permission map, and host dispatcher.
- `apps/web/src/lib/plugin-rpc-permissions.ts` contains a second permission map.
- `packages/plugin-schema` accepts contribution points and permissions that have no host implementation.

This duplication has already caused contract drift. The SDK exposes
`runtime.request` and `network.request`, while the real host dispatcher rejects
both as unknown methods. The manifest also accepts `commands`, `settings`, and
`secrets`, although Thunder does not provide their runtime behavior.

This phase intentionally makes a breaking cleanup. Unsupported public
capabilities are removed instead of preserved behind compatibility aliases.

## Goals

- Establish one source of truth for the browser-to-host plugin protocol.
- Ensure every stable SDK method is implemented by the real host dispatcher.
- Centralize method permissions and runtime parameter validation.
- Remove unsupported manifest fields, permissions, and SDK methods.
- Add contract tests that exercise the SDK against the real host dispatcher.
- Preserve the two-level `sandboxed` and `trusted` plugin model.

## Non-Goals

- Implementing the full sandboxed plugin development workflow.
- Implementing network proxying, secret storage, commands, or settings.
- Moving trusted workers into isolated processes.
- Changing plugin installation, signing, or marketplace behavior.
- Adding new DevTools functionality.

## Package Boundary

Create `packages/plugin-protocol` as the transport contract package.

It owns:

- bridge protocol version and message source constants
- request, response, and host-event envelopes
- stable bridge method names
- method parameter and result maps
- method-to-permission mapping
- runtime validation for incoming request parameters
- structured protocol errors

It depends on `@thunder/plugin-schema` for manifest and permission types. It
must not depend on React, Next.js, Hono, browser globals, or host application
state.

`packages/plugin-sdk` remains responsible for browser ergonomics such as
request IDs, timeouts, and convenience methods. `apps/web` remains responsible
for implementing capabilities using host services. Both consume
`@thunder/plugin-protocol`.

## Stable Capability Surface

The stable request methods after this phase are:

- `plugin.getManifest`
- `layout.setFrameHeight`
- `storage.get`
- `storage.set`
- `storage.remove`
- `storage.keys`
- `storage.clear`
- `notification.add`
- `activity.track`
- `worker.invoke`

The stable host event is:

- `theme.change`

The following are removed:

- `runtime.request`, `runtime.get`, `runtime.post`
- `network.request`, `network.get`, `network.post`
- `secrets`
- `contributes.commands`
- `contributes.settings`

The plugin kinds `sandboxed` and `trusted` remain in the manifest. Existing
rules continue to reject `native-runtime` and `filesystem:plugin-data` for
`sandboxed` plugins.

## Protocol Types

The protocol package defines a method map:

```ts
interface PluginBridgeMethodMap {
  "plugin.getManifest": {
    params: undefined
    result: ThunderPluginManifest
  }
  "layout.setFrameHeight": {
    params: { height: number }
    result: undefined
  }
  "storage.get": {
    params: { key: string }
    result: unknown | null
  }
  "storage.set": {
    params: { key: string; value: unknown }
    result: undefined
  }
  "storage.remove": {
    params: { key: string }
    result: undefined
  }
  "storage.keys": {
    params: undefined
    result: string[]
  }
  "storage.clear": {
    params: undefined
    result: undefined
  }
  "notification.add": {
    params: PluginNotificationParams
    result: undefined
  }
  "activity.track": {
    params: PluginActivityParams
    result: undefined
  }
  "worker.invoke": {
    params: { method: string; payload?: unknown }
    result: { ok: true; result: unknown }
  }
}
```

Requests and responses use this map so SDK and host compile against the same
method names and payload shapes.

## Validation and Errors

Incoming messages remain untrusted even when TypeScript types agree.
`parsePluginBridgeRequest` validates:

- envelope source and protocol version
- non-empty request ID
- method membership in the stable method map
- parameter object shapes
- storage key constraints
- frame height finiteness
- worker method naming constraints
- notification and activity string/object fields

Invalid input throws `PluginProtocolError` with a stable code:

- `INVALID_ENVELOPE`
- `UNSUPPORTED_METHOD`
- `INVALID_PARAMS`

The Web host converts these errors into normal bridge error responses. Plugin
business errors continue to return their existing messages.

## Host Dispatcher

Extract the method switch from the plugin page into a host-agnostic dispatcher
under `apps/web/src/lib`. The dispatcher receives explicit capability
dependencies:

- current manifest
- storage adapter
- notification callback
- activity callback
- worker invocation callback
- frame-height callback

It performs permission checks using the protocol package's single permission
map, invokes the relevant dependency, and returns the typed result.

The React page remains responsible for:

- validating `event.origin` and `event.source`
- posting responses to the iframe
- recording RPC diagnostics
- refreshing worker status
- applying returned side effects through dispatcher dependencies

## Manifest Cleanup

`packages/plugin-schema` rejects removed capabilities rather than silently
discarding them:

- `contributes.commands` produces an unsupported-field error.
- `contributes.settings` produces an unsupported-field error.
- `secrets` is no longer a valid permission.

Rejecting fields makes configuration mistakes visible during build and install.

## Testing

Tests are divided by ownership:

- `plugin-protocol`: parsing, method membership, permission mapping, and
  invalid input.
- `plugin-schema`: removed fields and permissions are rejected.
- `plugin-sdk`: public client surface emits only stable protocol messages.
- Web dispatcher: every stable method succeeds with fake dependencies and
  permission failures are enforced.
- SDK/Host contract: connect a fake browser window running the real SDK to the
  real dispatcher and verify representative result/error round trips.

The contract suite must enumerate every stable method. Adding a method to only
the SDK or only the host must fail tests or type checking.

## Documentation

Update the desktop plugin development, system, and platform documents to list
only the stable capability surface. Clearly state that network access,
secrets, commands, and settings are not currently public capabilities.

## Breaking Change Warning

This phase deliberately removes APIs that were declared but not operational.
Any plugin source using those APIs will fail type checking or manifest
validation and must remove them. No compatibility shim is provided.

