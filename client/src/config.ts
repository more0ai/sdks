/**
 * Capability client configuration.
 * Self-contained — no dependency on registry-client.
 *
 * Bootstrap is loaded exclusively from the NATS subject system.registry.bootstrap.
 * There is no file-based or inline bootstrap config.
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §5.5
 */

import type { InvocationContextWire } from "@more0ai/core/wire";
import type { NatsAuthProvider } from "./transport/auth-types.js";

export interface CapabilityClientConfig {
  // ── NATS (default/system server) ──────────────────────────────────
  natsUrl?: string;
  natsName?: string;

  // ── Defaults ──────────────────────────────────────────────────────
  defaultTenantId?: string;
  defaultTimeoutMs?: number;

  // ── Auth ──────────────────────────────────────────────────────────
  accessToken?: string;
  tokenProvider?: () => Promise<string | undefined>;

  // ── Multi-NATS / Sandbox Auth ─────────────────────────────────────
  /** Auth provider for obtaining credentials to remote NATS servers (sandboxes).
   *  Called lazily when the client needs to connect to a NATS server
   *  that is not the default. If not provided, the client can only
   *  invoke capabilities on the default NATS server. */
  natsAuthProvider?: NatsAuthProvider;
  /** Maximum concurrent NATS connections (default + remotes). Default: 10 */
  maxNatsConnections?: number;
  /** Close idle remote connections after this many ms. Default: 300000 (5 min) */
  idleConnectionTimeoutMs?: number;

  // ── Registry communication ────────────────────────────────────────
  registryCap?: string;
  invocationContext?: InvocationContextWire;
  requestTimeoutMs?: number;

  // ── Caching ───────────────────────────────────────────────────────
  resolutionCacheTtlSeconds?: number;
  discoveryCacheTtlSeconds?: number;
  negativeCacheTtlSeconds?: number;
  staleWhileRevalidate?: boolean;
  staleWindowSeconds?: number;

  // ── Change events ─────────────────────────────────────────────────
  changeEventPattern?: string;

  // ── Bootstrap ─────────────────────────────────────────────────────
  /** NATS subject for fetching bootstrap from registry (default: system.registry.bootstrap) */
  bootstrapSubject?: string;

  // ── Fallback ──────────────────────────────────────────────────────
  fallbackMappings?: Record<string, string>;
}

export const defaultCapabilityClientConfig = {
  natsUrl: "nats://127.0.0.1:4222",
  natsName: "capabilities-client",
  defaultTenantId: "",
  defaultTimeoutMs: 30_000,
  maxNatsConnections: 10,
  idleConnectionTimeoutMs: 300_000,
  registryCap: "system.registry",
  bootstrapSubject: "system.registry.bootstrap",
  changeEventPattern: "registry.changed.>",
  requestTimeoutMs: 10_000,
  resolutionCacheTtlSeconds: 300,
  discoveryCacheTtlSeconds: 60,
  negativeCacheTtlSeconds: 30,
  staleWhileRevalidate: true,
  staleWindowSeconds: 60,
} as const;
