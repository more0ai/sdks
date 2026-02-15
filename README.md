# More0ai SDKs

Monorepo containing client, core, and worker SDKs in multiple languages.

- **client** – Client for invoking and discovering more0ai via NATS
- **core** – Shared types, pipeline, middleware, policy, wire protocol, bootstrap, worker assignments
- **worker** – Worker pool for capability invocations with consumer-group subscription

Each package is organized by language: `node/` (TypeScript) and `php/` (PHP).

## Node / TypeScript

```powershell
pnpm install
pnpm run build
```

| Package           | Path        |
|-------------------|-------------|
| `@more0ai/common` | `common/node` |
| `@more0ai/client` | `client/node` |
| `@more0ai/worker` | `worker/node` |

## PHP

See `client/php`, `core/php`, and `worker/php` for Composer packages.
