# More0ai SDKs

Monorepo containing:

- **core** – Shared types, pipeline, middleware, policy, wire protocol, bootstrap, worker assignments
- **client** – Client for invoking and discovering more0ai via NATS
- **worker** – Worker pool for capability invocations with consumer-group subscription

## Setup

```powershell
pnpm install
```

## Build

```powershell
pnpm run build
```

## Packages

| Package           | Description                                      |
|-------------------|--------------------------------------------------|
| `@more0ai/core`   | Shared core (client and worker depend on this)  |
| `@more0ai/client` | NATS client SDK                                 |
| `@more0ai/worker` | Worker pool for capability invocations          |
