# Sandboxed Default Chain Design

## Context

Thunder preserves two plugin kinds:

- `sandboxed` is the default UI-only model. It runs in an isolated iframe and
  can use only explicitly declared Host Bridge capabilities.
- `trusted` is an exceptional model with a managed local runtime. It must be
  selected explicitly and remains subject to stronger installation warnings.

The protocol convergence phase removed declared-but-unimplemented capabilities.
This phase makes the sandboxed path usable end to end and reintroduces network
access only after a host-enforced implementation exists.

## Goals

- Make `thunder-plugin create` generate a sandboxed UI plugin by default.
- Reject `runtime` on sandboxed manifests.
- Provide a complete create, build, dev-install, iframe, SDK, and Host Bridge
  workflow without requiring a trusted runtime.
- Add exact-origin network permissions through a server-side proxy.
- Enforce iframe isolation, storage quotas, request size limits, timeouts, and
  rate limits.
- Make the default example exercise the sandboxed path.

## Non-Goals

- Wildcard network permissions.
- Direct network access from the plugin iframe.
- Cookie, credential, or authorization forwarding.
- Sandboxed workers, filesystem access, secrets, commands, or settings.
- A per-capability runtime permission prompt.
- Backward compatibility for invalid sandboxed manifests that declare runtime.

## CLI And Templates

The supported templates become:

- `sandboxed-ui`, the default.
- `trusted-app`, selected with `--template trusted-app`.

`sandboxed-basic` is removed because it has no distinct supported behavior.
The sandboxed template contains a sidebar UI, React entry point, SDK usage,
storage and notification permissions, and no worker or runtime declaration.

The existing build and dev flows continue to infer worker compilation from
`manifest.runtime`. A sandboxed project therefore builds and installs without
starting a runtime.

## Manifest And Permissions

`ThunderPluginPermission` supports both static permissions and dynamic network
permissions:

```ts
type ThunderPluginNetworkPermission = `network:${string}`
```

The parser accepts only canonical origins:

- production: `network:https://example.com` and explicit non-default ports
- development: the same HTTPS form plus HTTP loopback origins
- no path, query, fragment, credentials, or wildcard
- default ports are normalized away

Manifest parsing rejects any `runtime` field when `kind` is `sandboxed`.
Trusted plugins continue to require `runtime.entry`.

## Network Bridge

The protocol adds `network.request`:

```ts
interface PluginNetworkRequestParams {
  url: string
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  headers?: Record<string, string>
  body?: string
}

interface PluginNetworkResponse {
  status: number
  headers: Record<string, string>
  body: string
}
```

The Browser SDK exposes `thunder.network.request`, `get`, and `post`.
The iframe never receives a `connect-src` exception for declared origins.

The request flow is:

1. The SDK sends `network.request` to the Host Bridge.
2. The Web dispatcher validates the request and verifies that the manifest
   contains the exact `network:<origin>` permission.
3. The Web host calls
   `POST /api/v1/desktop/plugins/:id/network/request`.
4. The API reloads the installed manifest and repeats the exact-origin check.
5. The API performs a credential-free fetch with manual redirect handling.
6. Every redirect target is checked against the same declared origin.
7. The API returns a bounded text response to the plugin.

The proxy strips hop-by-hop, cookie, credential, host, origin, referer, and
forwarding headers. It never forwards browser credentials.

## Resource Limits

Limits are constants with focused tests:

- bridge request payload: 512 KiB
- plugin storage: 1 MiB total serialized data
- individual storage value: 256 KiB
- network request body: 1 MiB
- network response body: 5 MiB
- network timeout: 10 seconds
- redirects: at most 3
- bridge calls: 120 per minute per plugin frame
- network calls: 20 per minute per plugin frame

Storage remains browser-local and namespaced by plugin id. A dedicated storage
adapter computes serialized UTF-8 byte usage before writes and throws a clear
quota error without changing existing data.

Rate limiting lives in the Web host because it protects the current frame from
request floods. The API independently enforces body, timeout, redirect, and
origin constraints because iframe input and Web-host requests are untrusted.

## Iframe Policy

Sandboxed UI assets use a restrictive CSP:

```text
default-src 'self';
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'none';
object-src 'none';
base-uri 'none';
frame-src 'none';
form-action 'none'
```

The iframe keeps `allow-scripts`, `allow-forms`, and `allow-same-origin` only
because plugin assets are served from a dedicated loopback origin. Sandboxed
plugins do not receive popup or modal allowances. Permissions Policy is derived
from the manifest; microphone is enabled only when declared.

The page continues to require matching `event.origin`, `event.source`, protocol
source, version, and the page-bound plugin id before dispatch.

## Errors

Protocol validation errors retain their stable codes. Host capability failures
use clear messages for:

- missing exact-origin permission
- malformed or oversized payload
- storage quota exceeded
- rate limit exceeded
- blocked redirect
- timeout
- upstream response too large

The API maps policy violations to 400 or 403, throttling to 429, timeout to 504,
and upstream failures to 502.

## Testing

- Schema tests cover dynamic permission normalization, invalid origins, and
  sandboxed runtime rejection.
- CLI tests prove the default template is sandboxed and trusted is explicit.
- Protocol and SDK tests cover network request shapes and convenience methods.
- Web dispatcher tests cover exact-origin authorization and rate limiting.
- Storage adapter tests cover total and per-value quotas without partial writes.
- API tests cover header stripping, exact-origin checks, redirects, timeout, and
  response-size limits using an injected fetch implementation.
- Contract tests enumerate `network.request` alongside every stable method.
- The Hello example builds, installs, loads, stores data, and sends a
  notification without starting a runtime.

## Documentation And Breaking Changes

The desktop plugin documents describe sandboxed as the default and trusted as
an explicit exceptional choice. They document exact-origin network permissions
and all quotas.

This phase removes the unused `sandboxed-basic` template name and rejects
sandboxed runtime declarations. No compatibility alias is provided.
