/**
 * Bootstrap loader: resolves capability names to subjects using bootstrap config.
 */

import { readFileSync, existsSync } from "node:fs";
import type { ResolvedCapabilitySpec } from "./config.js";
import type { WorkerPoolConfig } from "./config.js";

const LOG_PREFIX = "capabilities-worker:bootstrap";

export interface BootstrapCapability {
  subject: string;
  major: number;
  version: string;
  status: string;
  description: string;
  methods: string[];
  isSystem?: boolean;
  ttlSeconds: number;
}

export interface BootstrapConfig {
  name: string;
  version: string;
  description: string;
  minimum_capabilities?: string[];
  capabilities: Record<string, BootstrapCapability>;
  aliases?: Record<string, string>;
}

/**
 * Load bootstrap from a JSON file. Returns null if path missing or invalid.
 */
export function loadBootstrap(params: {
  path: string;
  log?: any;
}): BootstrapConfig | null {
  const { path, log = console } = params;
  if (!existsSync(path)) {
    log.warn?.({ path }, `${LOG_PREFIX}:loadBootstrap - Bootstrap file not found`);
    return null;
  }
  try {
    const content = readFileSync(path, "utf-8");
    const config = JSON.parse(content) as BootstrapConfig;
    log.info?.(
      { path, capabilities: Object.keys(config.capabilities).length },
      `${LOG_PREFIX}:loadBootstrap - Loaded bootstrap`
    );
    return config;
  } catch (err: any) {
    log.error?.(
      { path, error: err?.message },
      `${LOG_PREFIX}:loadBootstrap - Failed to parse bootstrap`
    );
    return null;
  }
}

/**
 * Resolve a capability name via bootstrap (and aliases). Returns subject or null.
 */
function resolveCapabilitySubject(
  bootstrap: BootstrapConfig,
  capabilityName: string
): string | null {
  const name = bootstrap.aliases?.[capabilityName] ?? capabilityName;
  const cap = bootstrap.capabilities[name];
  return cap?.subject ?? null;
}

/**
 * Resolve a worker pool's capabilities to subscription specs (subject + consumer group).
 * Uses pool's consumerGroup for all. Skips capabilities not found in bootstrap.
 */
export function resolvePoolCapabilities(params: {
  bootstrap: BootstrapConfig;
  pool: WorkerPoolConfig;
  log?: any;
}): ResolvedCapabilitySpec[] {
  const { bootstrap, pool, log = console } = params;
  const specs: ResolvedCapabilitySpec[] = [];
  for (const capability of pool.capabilities) {
    const subject = resolveCapabilitySubject(bootstrap, capability);
    if (!subject) {
      log.warn?.(
        { capability, poolId: pool.id },
        `${LOG_PREFIX}:resolvePoolCapabilities - Capability not in bootstrap, skipping`
      );
      continue;
    }
    specs.push({
      capability,
      subject,
      consumerGroup: pool.consumerGroup,
    });
  }
  return specs;
}

/**
 * Default bootstrap with common system capabilities (used when no file is provided).
 */
export function getDefaultBootstrap(): BootstrapConfig {
  return {
    name: "morezero-bootstrap",
    version: "1.0.0",
    description: "Default capability bootstrap",
    minimum_capabilities: [
      "system.registry",
      "system.auth",
      "system.config",
      "system.health",
      "system.events",
    ],
    capabilities: {
      "system.registry": {
        subject: "cap.system.registry.v1",
        major: 1,
        version: "1.0.0",
        status: "active",
        description: "Core registry service",
        methods: [
          "resolve",
          "discover",
          "describe",
          "upsert",
          "deprecate",
          "disable",
          "setDefaultMajor",
          "listMajors",
          "health",
        ],
        isSystem: true,
        ttlSeconds: 0,
      },
      "system.auth": {
        subject: "cap.system.auth.v1",
        major: 1,
        version: "1.0.0",
        status: "active",
        description: "Authentication and authorization",
        methods: ["authenticate", "authorize", "validate", "refresh"],
        isSystem: true,
        ttlSeconds: 0,
      },
      "system.config": {
        subject: "cap.system.config.v1",
        major: 1,
        version: "1.0.0",
        status: "active",
        description: "Configuration service",
        methods: ["get", "set", "list", "watch"],
        isSystem: true,
        ttlSeconds: 0,
      },
      "system.health": {
        subject: "cap.system.health.v1",
        major: 1,
        version: "1.0.0",
        status: "active",
        description: "System health",
        methods: ["check", "status", "metrics"],
        isSystem: true,
        ttlSeconds: 0,
      },
      "system.events": {
        subject: "cap.system.events.v1",
        major: 1,
        version: "1.0.0",
        status: "active",
        description: "Event bus",
        methods: ["publish", "subscribe", "unsubscribe"],
        isSystem: true,
        ttlSeconds: 0,
      },
    },
    aliases: {
      registry: "system.registry",
      auth: "system.auth",
      config: "system.config",
    },
  };
}
