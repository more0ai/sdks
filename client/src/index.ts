/**
 * @morezero/capabilities-client
 *
 * Pipeline-based client for invoking and discovering capabilities via NATS.
 * Single entry point for capability interaction.
 */

// Main client
export { CapabilityClient, type CapabilityClientOptions } from "./client.js";

// Config
export { type CapabilityClientConfig, defaultCapabilityClientConfig } from "./config.js";

// Client-specific middleware
export { createResolveMiddleware } from "./middleware/resolve.js";
export {
  createEnrichContextMiddleware,
  type ContextEnrichmentConfig,
} from "./middleware/enrich-context.js";

// Transport
export {
  createNatsTransportCore,
  type NatsTransportConfig,
} from "./transport/nats-transport.js";

// Connection pool (multi-NATS / sandbox support)
export {
  NatsConnectionPool,
  type ConnectionPoolConfig,
  type ConnectionPoolStats,
} from "./transport/connection-pool.js";

// NATS auth types (sandbox credential management)
export type {
  NatsCredentials,
  NatsAuthProvider,
  NatsAuthProviderParams,
} from "./transport/auth-types.js";

// HTTP auth provider (reference implementation for sandbox credentials)
export {
  createHttpNatsAuthProvider,
  type HttpNatsAuthProviderConfig,
} from "./transport/auth-provider-http.js";

// Resolution (absorbed from registry-client)
export { ResolutionClient, ResolutionError } from "./resolution/client.js";
export { ResolutionCache, type ResolutionCacheConfig } from "./resolution/cache.js";

// Discovery (absorbed from registry-client)
export { DiscoveryClient } from "./discovery/client.js";
export { DiscoveryCache, type DiscoveryCacheConfig } from "./discovery/cache.js";

// Bootstrap types (bootstrap is loaded exclusively from system.registry.bootstrap NATS subject)
export {
  type BootstrapConfig,
  type BootstrapCapability,
  type ResolvedBootstrap,
  type ResolvedBootstrapEntry,
} from "./bootstrap/index.js";

// Invalidation (absorbed from registry-client)
export {
  InvalidationSubscriber,
  type InvalidationSubscriberConfig,
  type InvalidationHandler,
} from "./invalidation/subscriber.js";

// Cache utilities (absorbed from registry-client)
export { TTLCache, type TTLCacheConfig } from "./cache/ttl-cache.js";
export { InFlightDedup } from "./cache/dedup.js";

// Registry wire types
export type {
  ResolveInput,
  ResolveOutput,
  DiscoverInput,
  DiscoverOutput,
  DescribeInput,
  DescribeOutput,
  ListMajorsInput,
  ListMajorsOutput,
  RegistryChangedEvent,
  ResolutionContext,
  VersionStatus,
} from "./types/registry.js";

// Identity (parsing, canonicalization)
export {
  parseReference,
  normalizeVersion,
  canonicalize,
  IdentityError,
  type ParsedReference,
  type CanonicalizeOptions,
} from "./identity/index.js";

// Re-export core types for convenience
export type {
  Middleware,
  InvocationEnvelope,
  InvocationResult,
  InvocationContext,
  InvocationOk,
  InvocationErr,
  InvocationMeta,
} from "@more0ai/core";
